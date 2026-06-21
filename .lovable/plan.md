
# Gator SSDI — Phase 1 scaffold

UI layer over Zoho CRM v8. Zoho is the system of record; this app is the staff interface. Per-user Zoho attribution is the non-negotiable architectural rule — every CRM write flows through *that user's* refresh token.

## What ships in this phase

1. Google SSO (restricted to `gatorlawpc.com`) via Lovable Cloud auth.
2. Per-user Zoho OAuth round-trip; refresh tokens stored server-side only.
3. Cases list (live COQL read from `SSDI_Cases`).
4. Case detail with the **Advance Stage** action wired end-to-end through `caseService.advanceStage`.
5. Deadlines screen (at-risk appeals + expiring releases).
6. Daily deadline sweep endpoint, ready for an external cron.

Out of scope this round (slots in later, cleanly): intake/lead conversion, Zoho Sign, Gmail/Calendar/Drive, FCRA modules, dashboard polish beyond two basic widgets.

## Stack decision

Backend uses **TanStack server functions + server routes**, not Supabase Edge Functions. Same security guarantees (refresh tokens never reach the browser; service-role DB access stays server-only), native to this project, fewer moving parts. The provided `zohoClient.ts` / `caseService.ts` / `deadlines.ts` / `lifecycle.ts` / `fees.ts` are framework-agnostic and drop in unchanged.

## Lovable Cloud setup

Enable Cloud, then:

- Enable Google provider; restrict sign-in to `gatorlawpc.com` (domain check in the auth gate).
- Table `zoho_tokens`:
  - `user_id uuid primary key references auth.users(id) on delete cascade`
  - `zoho_user_id text`, `refresh_token text`, `created_at timestamptz default now()`
  - RLS ON; **no policies granting client access**. Only server code (service role) reads/writes.
- Secrets (runtime): `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REDIRECT_URI`, `ZOHO_DC=us`, `DEADLINE_SWEEP_SECRET` (for the cron endpoint).

Redirect URI to register in your Zoho app:
`https://project--<project-id>.lovable.app/api/zoho/connect/callback`
(also add the preview URL `…-dev.lovable.app/...` for testing).

## File layout

```
src/integrations/zoho/
  zohoClient.ts            # provided, unchanged
  deadlines.ts             # provided, unchanged
  fees.ts                  # provided, unchanged
  lifecycle.ts             # provided, unchanged
  caseService.ts           # provided, unchanged
  tokenStore.server.ts     # ZohoTokenStore impl over zoho_tokens (service role)
  client.server.ts         # makeZohoClient() factory reading env + tokenStore

src/lib/
  zoho.functions.ts        # server fns: zohoQuery, caseAdvance, getCase, getConnectionStatus
  zoho-connect.functions.ts# server fn: getAuthorizeUrl (returns URL for current user)

src/routes/
  __root.tsx               # existing, add onAuthStateChange + router.invalidate
  index.tsx                # redirect to /dashboard if signed in else /auth
  auth.tsx                 # Google sign-in button (domain-gated)
  api/zoho/connect/callback.ts  # OAuth callback → handleCallback → redirect /dashboard
  api/public/deadline-sweep.ts  # cron endpoint (Bearer DEADLINE_SWEEP_SECRET)
  _authenticated/route.tsx # integration-managed, leave alone
  _authenticated/_app.tsx  # shell layout: left nav + topbar w/ Zoho status
  _authenticated/dashboard.tsx
  _authenticated/cases.index.tsx
  _authenticated/cases.$caseId.tsx
  _authenticated/deadlines.tsx
  _authenticated/connect-zoho.tsx  # shown when user has no refresh token

src/components/
  AppShell.tsx, NavSidebar.tsx, TopBar.tsx, ZohoStatusPill.tsx
  cases/StageRail.tsx, AdvanceStageDialog.tsx, DeadlinePanel.tsx, AtRiskBadge.tsx
```

## Server functions (the contract the UI calls)

All wrapped with `requireSupabaseAuth`. Each resolves `userKey = userId` from context, then calls `makeZohoClient().as(userKey)`.

- `getConnectionStatus()` → `{ connected: boolean, zohoUserId?: string }` (checks `zoho_tokens` row).
- `getAuthorizeUrl()` → `{ url }` (state = signed user id, HMAC-signed to prevent tampering).
- `zohoQuery({ name, params })` → rows. **Whitelisted queries only** — the four COQL queries from `zoho-api-contract.md` plus `caseById`, `costsByEngagement`. Never accept raw COQL from the client.
- `getCase({ caseId })` → full record (calls `client.as(userId).getRecord("SSDI_Cases", id)`).
- `caseAdvance({ caseId, toStage, fields })` → `{ deadline }` via `createCaseService({ zoho }).advanceStage(userId, caseId, toStage, { fields })`.

## Server routes

- `GET /api/zoho/connect/callback?code=…&state=…` — verifies HMAC state, resolves user, calls `client.handleCallback(userId, code)`, redirects to `/dashboard`.
- `POST /api/public/deadline-sweep` — requires `Authorization: Bearer <DEADLINE_SWEEP_SECRET>`, runs `createCaseService({ zoho }).runDailyDeadlineSweep()` as `SERVICE` actor.

## Screens

**`/auth`** — single Google button. Reject sign-in if email doesn't end in `@gatorlawpc.com` (client-side check + server validation on first protected fn call; if not allowed, sign out and toast).

**App shell (`_authenticated/_app.tsx`)** — left nav (Dashboard / Cases / Deadlines), top bar with user email and a `ZohoStatusPill` (green "Connected" / amber "Connect Zoho" link to `/connect-zoho`). If `getConnectionStatus().connected === false`, every page route redirects to `/connect-zoho` (except the connect page itself).

**`/connect-zoho`** — explainer text + button → calls `getAuthorizeUrl()`, `window.location = url`.

**`/dashboard`** — two widgets, sparse:
- Pipeline counts: `select Current_Stage, count(id) from SSDI_Cases where Is_Closed=false group by Current_Stage`.
- "Deadlines at risk" count + link to `/deadlines`.

**`/cases`** — table from `myOpenCases` / `allOpenCases` COQL. Columns: Case_Number, Current_Stage, Sub_Status, Deadline_Date, Days_To_Deadline. Filter chips: `My Cases` (default), `At Risk`, by Stage (dropdown). Row click → `/cases/$caseId`.

**`/cases/$caseId`** — the workhorse:
- Header: Case_Number, linked Engagement (Client name), `<StageRail>` visualizing the 24-stage lifecycle with current stage highlighted.
- Sections: SSA case data · lifecycle dates · `<DeadlinePanel>` (Active_Deadline_Type, Deadline_Date, Days_To_Deadline, AtRiskBadge) · fees (Back_Pay_Amount → Projected_Fee, User_Fee_Withheld; formula fields shown read-only) · costs list (`Costs` where `Engagement = …`).
- **Advance Stage** button → `<AdvanceStageDialog>`: shows only the valid next stages from `TRANSITIONS[currentStage]`. When the chosen stage needs data (e.g. a denial stage needs `Notice_Date` and the corresponding decision-date field), the dialog dynamically asks for those fields before submitting. On success: invalidate the case query and toast the new deadline.

**`/deadlines`** — flat urgency-sorted list across all open cases. Two sections: appeal deadlines `Deadline_At_Risk = true` (red badge) and `Release_Expiring_Soon = true` releases. Each row links to its case. This is the malpractice screen — always reachable from the nav.

## UX

Dense, legal-professional. Neutral palette; **red badge only for at-risk deadlines**. Clear empty states: app-written fields (`Deadline_Date`, `Days_To_Deadline`, `Deadline_At_Risk`, `Release_Expiration_Date`, `Release_Expiring_Soon`) start empty and fill in as the sweep + stage hooks run — surface that explicitly with "Computed by the deadline engine — populates once a case advances or the daily sweep runs."

All writes go through server fns (per-user attribution). Optimistic UI on stage advance is fine but reconcile on response.

## Acceptance check (end of phase)

1. Sign in with a `@gatorlawpc.com` Google account → land on `/connect-zoho`.
2. Click Connect → Zoho consent → redirect back → `zoho_tokens` row created → land on `/dashboard`.
3. `/cases` shows live rows from `SSDI_Cases` (proves the COQL round-trip works AS the user).
4. Open a case, click Advance Stage on an "Initial decision - pending" case, choose "Initial decision - denied", supply `Notice_Date` + `Initial_Decision_Date` → case updates, `Deadline_Date` populates, a "File reconsideration" task is created in Zoho attributed to *that staff member*.
5. `/deadlines` lists the now-at-risk case.

## Tech notes / gotchas

- Engine files use Deno-ish ESM; they're framework-agnostic and run fine in the Worker SSR runtime. No changes needed.
- `tokenStore.server.ts` uses `supabaseAdmin` (service role), loaded inside server-fn handlers via `await import(...)` to respect the import-graph rules.
- The Zoho redirect URI must be added in the Zoho API console *and* set as `ZOHO_REDIRECT_URI` secret — they must match exactly.
- The `state` parameter on OAuth is HMAC-signed with `ZOHO_CLIENT_SECRET` so the callback can trust which user the code belongs to without a session cookie.
- Daily sweep: external cron (e.g. cron-job.org or GitHub Actions) hits `POST /api/public/deadline-sweep` with the bearer secret. No platform cron required.
- Never write to formula/rollup fields (`Projected_Fee`, `User_Fee_Withheld`, `All_Fees`, `Total_Costs1`, `Net_Contribution`).
