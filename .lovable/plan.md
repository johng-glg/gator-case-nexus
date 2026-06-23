# Client Portal v2 — firm-wide, multi-practice, client-scoped

Supersedes the portal-invite/automation pieces of the earlier reorg. Keeps the SSDI case page work intact.

## 1. The contract (`src/integrations/portal/portal.ts`)

Drop in the file you supplied verbatim: `PortalMatter`, `PortalAction`, `PortalKeyDate`, `PortalView`, `buildPortalView`, `SsdiPortalInput`, `ssdiToPortalMatter`, `ssdiPortalAdapter`. This is the only place client-facing data is shaped — fees / notes / strategy can't reach the portal because the adapter only accepts the allowlisted input shape.

Add stub adapters (return `statusLabel: "Dispute in progress"`, no key dates, no actions) so the shell is provably practice-agnostic:
- `src/integrations/portal/adapters/fcra.ts` → `"Credit report dispute"`
- `src/integrations/portal/adapters/fdcpa.ts` → `"Debt-collection dispute"`
- `src/integrations/portal/adapters/tcpa.ts` → `"TCPA matter"`
- `src/integrations/portal/adapters/classAction.ts` → `"Class action"` (no client-specific data ever)

## 2. Schema — re-key portal to Contact, not Case

New migration. The current `client_portal_links` is case-keyed and breaks the "one login, all matters" model.

- New table `public.client_portal_contacts`: `user_id` (unique), `email`, `zoho_contact_id` (unique, required), `invited_by`, timestamps. RLS: a user reads only their own row.
- Backfill: copy each existing `client_portal_links.zoho_engagement_id` → look up its `Client` (Contact) in Zoho → insert into `client_portal_contacts`. Done by a one-shot server fn the user kicks off (logged to activity). Old table kept for one release as a fallback, then dropped.
- Grants: `authenticated` SELECT-only on own row; `service_role` ALL.

## 3. Auth — passwordless, OTP code OR magic link, 30-day session

Stays passwordless (no passwords). Both delivery modes from one screen.

`/client-auth` (rewrite the existing route):
- Two-step form: email → "we sent a link AND a 6-digit code. Click the link OR type the code here."
- Server uses `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })`. Supabase's email OTP delivers both a link and a 6-digit code in the same template.
- Code entry calls `supabase.auth.verifyOtp({ email, token, type: "email" })`.
- "Remember this device" checkbox (default on) → set Supabase session `expires_in` to 30 days via project auth config (`session_lifetime`); current default is fine, just document it.
- Update the branded `magic-link.tsx` email template to show both the button and the 6-digit code (`{{ .Token }}`) clearly.
- Invite email (`invite.tsx`) already passwordless after the prior turn — leave content, just point CTA to `/portal`.

## 4. Loader — assemble PortalView for a Contact

New server fn `getMyPortalView` in `src/lib/portal.functions.ts` (replaces `getMyClientPortal`):

1. Look up `client_portal_contacts` row for `context.userId` → `zoho_contact_id`. If none → `{ linked: false }`.
2. Service-role Zoho client: list **Engagements** where `Client.id = zoho_contact_id`, fields `id, Name, Practice, Stage, Current_Stage, Retainer_Signed, Assigned_Attorney, Modified_Time, Linked_SSDI_Case`.
3. For each engagement, dispatch to the practice adapter:
   - `SSDI`: load the linked `SSDI_Cases` record (allowlisted fields only — `Current_Stage`, `ALJ_Hearing_Scheduled_Date`, `Assigned_Attorney`), look up `document_requests` (open only, project to `{id, label}`), check if intake questionnaire is outstanding (a new boolean on `client_portal_contacts.questionnaire_completed_at` keyed per matter — stored as `jsonb` map `{engagementId: ISO}` to keep migrations small). Pass into `ssdiToPortalMatter`.
   - Other practices: call the stub adapter with `engagementId`, `title`, `statusLabel` only.
4. `buildPortalView(matters)` → return to client.

All raw Zoho records stay server-side; only `PortalMatter[]` crosses the wire.

## 5. Shell UI

New route layout: keep `_client/portal.tsx` as the landing, add `_client/portal.$matterId.tsx` as the matter detail. `_client/route.tsx` stays the auth gate.

**Landing (`/portal`):**
- 1 matter → `<Navigate to="/portal/$matterId" replace />`.
- Multiple matters →
  - Top card **"What we need from you"** rendering `actionsSummary` (matter title + action label, deep-link to that matter's detail with an anchor for the action).
  - Matters list, one card each: practice chip, `title`, `statusLabel`, "Action needed" badge when `actionsNeeded.length > 0`.

**Matter detail (`/portal/$matterId`):**
- Header: practice chip, title, attorney.
- Status block: `statusLabel` + a 5-step progress indicator for SSDI matters (Retained → Application → Decision → Hearing → Award), greyed-out for other practices.
- **"What we need from you"** with action chips (sign / upload / questionnaire / info); each routes to its handler (retainer e-sign URL, doc upload modal scoped to the matter, `/portal/intake?engagement=...`).
- **Documents**: re-scope `ClientDocumentsSection` to take an `engagementId`-first key (falls back to `caseId` for SSDI). Show only this matter's uploads + open requests.
- **Messages**: thread-per-engagement; reuse the existing messaging service with `engagementId` as the thread key (already what it does).
- **Key dates**: render `keyDates` only.
- **Your team**: attorney name from the adapter; no other staff.

**Account (`/portal/account`):**
- Notification settings (existing `ClientPortalSettings`) + "SMS — coming soon" disabled toggle. Contact info read-only.

Visual rules: forest-green primary, large body text (`text-base` default, `text-lg` for status), generous spacing — same brand tokens as `/portal` today.

## 6. Automation split — `onConversion` vs `onCaseOpened`

Move the early-onboarding steps out of `onCaseOpened` into a new playbook so the portal is ready the moment a Lead converts.

New `src/integrations/zoho/conversionPlaybook.ts` — `onConversion({ engagementId, contactId, actor })`:
1. Auto-invite to portal (uses new `client_portal_contacts` keyed by `zoho_contact_id`).
2. Welcome email (`ssdi-welcome-packet` repurposed as practice-agnostic `client-welcome-packet`, or branched by `engagement.Practice`).
3. Intake questionnaire email + open `document_requests` row scoped by `engagement_id`.
4. Carry-forward screener data (where already wired).
5. All idempotent + `firm_intake_settings`-gated (reuses the same toggle config).

`convertLead` in `src/lib/zoho.functions.ts` calls `onConversion` instead of the inline `autoInvitePortal` block. `onCaseOpened` keeps SSDI-only items: SSA-1696 e-sign, SSA-827 prepare, task bundle, internal notification. It no longer sends welcome/questionnaire/docrequest/portal invite (logs them as `skipped — handled at conversion`).

The retainer-signed hook (`signClient.server.ts`) still calls `onCaseOpened`; nothing changes there.

## 7. Allowlist enforcement

- Type signature: every adapter accepts a narrow input interface, not the raw Zoho record. Loader explicitly projects fields before calling the adapter — reviewers can grep for the projection list per practice.
- Test: add `src/integrations/portal/__tests__/portal.test.ts` checking that the SSDI adapter ignores `fee_amount`, `internal_notes`, `strategy_notes` if accidentally passed (TypeScript already rejects them; runtime test asserts no leak even if cast `as any`).

## Acceptance

- Two-matter client (SSDI + stub FCRA): logs in, lands on multi-matter view, "what we need" combines both.
- Single-matter client: lands directly in matter detail.
- Just-converted (no case yet) client: matter shows status `"Action needed — sign your representation agreement"`, action chip routes to e-sign, questionnaire + document-request actions visible.
- SSDI denial stage maps to `"…we're handling your appeal"`, never `"DENIED"`.
- Grep the loader output: no fee / note / strategy field reaches `PortalMatter`.
- OTP code path verified end-to-end (paste code into form, lands in `/portal`).

## Files

**New**
- `src/integrations/portal/portal.ts` (the contract you supplied)
- `src/integrations/portal/adapters/{ssdi,fcra,fdcpa,tcpa,classAction}.ts`
- `src/integrations/portal/__tests__/portal.test.ts`
- `src/integrations/zoho/conversionPlaybook.ts`
- `src/routes/_client/portal.$matterId.tsx`
- `src/routes/_client/portal.account.tsx`
- Migration: `client_portal_contacts` + backfill helper.

**Edited**
- `src/routes/client-auth.tsx` — add OTP code input.
- `src/lib/email-templates/magic-link.tsx` — include 6-digit code.
- `src/routes/_client/portal.tsx` — landing (multi-matter or redirect).
- `src/lib/portal.functions.ts` — replace `getMyClientPortal` with `getMyPortalView`; rewrite `inviteClientToPortal` and `autoInvitePortal` against `client_portal_contacts`.
- `src/integrations/portal/autoInvite.server.ts` — operate on contact id.
- `src/integrations/zoho/caseIntakeService.ts` — strip steps 4–7, 9; keep SSA-1696, SSA-827, tasks, internal notification.
- `src/lib/zoho.functions.ts` — `convertLead` calls `onConversion`.
- `src/components/portal/ClientDocumentsSection.tsx` — engagement-first scoping.

## Open questions

- **OTP vs magic link only** — confirm both delivery (link + 6-digit code in same email) is what you want, vs link-only with the code as a fallback in a separate "trouble?" flow. Plan currently assumes both in one email.
- **Backfill cutover** — keep `client_portal_links` for one release as fallback, or drop in the same migration?
