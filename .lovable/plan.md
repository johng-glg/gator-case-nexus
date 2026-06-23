# Case page polish — lifecycle, deadline clearing, fixes

## A. Lifecycle rail
Rewrite `src/components/cases/StageRail.tsx`:
- Remove the "Show / Hide full timeline" section and `ALL_STAGES` entirely.
- Phase chips become buttons with a chevron icon. Click expands/collapses that phase's sub-stage list. Active phase starts **collapsed** (the status strip already shows the exact stage). Only one phase open at a time.
- Sub-stage list reads from `PHASES[i].stages` after the lifecycle.ts cleanup in §C, so removed `*-pending` stages disappear automatically.
- Sub-stages stay read-only (Check / CircleDot / Circle); advancement remains the header's "Advance stage" button.

Move "Re-send portal invite" into the ⋯ menu:
- Drop `<InviteClientButton>` from the case header (`practices.ssdi.cases.$caseId.tsx`).
- Add a "Re-send portal invite" item in `CaseActionsMenu` that opens the same dialog (lift the dialog out of `InviteClientButton` into a small `InviteClientDialog` component the menu opens, or keep `InviteClientButton` and render it inside the menu item as a trigger). Reuses existing server fn, no backend change.

## B. Retire deadlines when appeal is filed / case is won
Engine changes (pure):
- `src/integrations/zoho/lifecycle.ts`:
  - Add `clearDeadline?: boolean` to `StageEffects`.
  - Set `clearDeadline: true` in HOOKS for: `Reconsideration filed`, `ALJ hearing requested`, `Appeals Council requested`, `Initial decision approved`, `Recon decision approved`, `ALJ decision approved`, `AC decision approved`, `Award / NOA received`. (Add minimal HOOKS entries for the "approved" / "filed" stages that don't have one today.)
- `src/integrations/zoho/caseService.ts` `advanceStage`: after computing `effects`, if `effects?.clearDeadline` and no `setDeadline`, set
  `Active_Deadline_Type = "None"`, `Deadline_Date = null`, `Days_To_Deadline = null`, `Deadline_At_Risk = false` on the update payload.
- Tests: extend `caseService.test.ts` to cover (a) advancing into `Reconsideration filed` clears a denial deadline, (b) `Award / NOA received` clears, (c) `Initial decision denied → Reconsideration filed → Recon decision denied` re-sets the new tier.

UI:
- `CaseStatusStrip` and `DeadlinePanel` already render "No appeal deadline active" when `deadlineISO` is null — verify and tighten copy. No new branches needed once the engine writes null.
- Nightly sweep already skips tier `"None"` (no change).

## C. Finish removing the 5 retired stages
Decision needed before coding: which stages to actually remove. Prompt says 5 — the pending ones plus "Hearing prep". Proposed cut list (matches prompt's example): `Initial decision pending`, `Recon decision pending`, `ALJ decision pending`, `AC decision pending`, `Hearing prep`.

Changes:
- `Stage` union: drop those 5.
- `TRANSITIONS`: collapse — `Application filed → Initial decision denied | approved | Closed`, `Reconsideration filed → Recon decision denied | approved | Closed`, `Hearing held → ALJ decision denied | approved | Closed`, `Appeals Council requested → AC decision denied | approved | Closed`, `Hearing scheduled → Hearing held | Closed`.
- `PHASES`: remove the 5 from each phase's `stages` array (sub-stage list now matches).
- `normalizeStage`: extend the `legacy` map so historical/Zoho values resolve:
  - `Initial decision pending → Application filed`
  - `Recon decision pending → Reconsideration filed`
  - `ALJ decision pending → Hearing held`
  - `AC decision pending → Appeals Council requested`
  - `Hearing prep → Hearing scheduled`
- `HOOKS`, `REQUIRED_FIELDS`, `DENIAL_NEXT_STEP`: drop dead entries.
- Zoho `Current_Stage` picklist: cannot edit from code — surface a follow-up note for the user to remove those picklist values in Zoho. App keeps working because `normalizeStage` maps them.
- Tests: update `phasetest.ts`, `caseService.test.ts`, `invariants.test.ts` references to removed stages.

## D. Email sending — fix the 401
Diagnosis: `case_activity_log` shows `email send 401 {error: Unauthorized}` from `sendCaseStatusEmail` calling `/lovable/email/transactional/send`. The route validates `Authorization: Bearer <jwt>` via Supabase; the adapter sends `SUPABASE_SERVICE_ROLE_KEY`, but the route calls `supabase.auth.getUser(serviceKey)` which returns no user → 401. The service-role key is not a user JWT, so this never worked.

Fix path:
1. **Bypass the HTTP round-trip.** Refactor `src/integrations/messaging/emailAdapter.server.ts` to call the same render + enqueue pipeline directly with `supabaseAdmin`:
   - Look up template from `src/lib/email-templates/registry.ts`.
   - Render with `@react-email/components` `render` (html + plainText).
   - Check `suppressed_emails`; insert `email_send_log` row (`pending`); upsert `email_unsubscribe_tokens`; `supabaseAdmin.rpc('enqueue_email', { queue_name: 'transactional_emails', payload: {...} })` — same payload shape (`message_id`, `to`, `from`, `sender_domain`, `subject`, `html`, `text`, `purpose`, `label`, `idempotency_key`, `unsubscribe_token`, `queued_at`).
   - Keep `sendCaseStatusEmail` signature; no change at call sites (`notifyService.server.ts`, `caseIntakeService.ts`, `conversionPlaybook.ts`).
2. The scaffolded `/lovable/email/transactional/send` route stays untouched for dashboard previews and any authenticated UI use.
3. Surface failures: in `MessagingPanel`, add a "delivery failed" badge per sent-history row whose latest `email_send_log` status is `failed` / `dlq`. Extend `listCaseMessages` to join the most recent log status per `msgKey` and return `deliveryStatus`.

Verification: after the change, run intake playbook on a real case → confirm `email_send_log` row goes `pending → sent`, message arrives in the inbox. Existing failed rows in `case_activity_log` stay as historical noise — no migration.

## E. Maximization (scoped)
Confirm scope before coding — these are independent and each is a real piece of work. Default if you say "all": ship E1-E4, defer E5-E8.

- **E1 Stage-aware Action Center.** `ActionCenter` takes `stage` and renders a per-stage "current focus" line + 1-2 stage-specific suggested tasks (lookup table next to lifecycle.ts).
- **E2 Evidence-readiness banner.** New `EvidenceReadinessBanner` reads provider count + open records requests + SSA-827 status; shows a warning when advancing to `Hearing scheduled`+, and forces a typed-reason confirm in `AdvanceStageDialog` for `Hearing scheduled → Hearing held` when 0 received records.
- **E3 One-click next action.** Where `DENIAL_NEXT_STEP[stage]` exists, the Action Center's primary button opens `AdvanceStageDialog` preselected to that stage.
- **E4 Auto-recompute on Notice-date edit.** When `Notice_Date` is edited (case-facts inline edit or advance dialog), call `recomputeDeadline` server fn automatically; drop the manual "Recompute" item from ⋯ (engine fn stays, just unwired from UI).
- **E5 Sub-status reconciliation.** Stop writing `Sub_Status = "Awaiting decision"` in `zoho.functions.ts`; remove the column from list views, keep the case-facts row only if it has a non-derivable value.
- **E6 Drag-and-drop upload + activity log type filter.** Bigger surface — split into its own task.
- **E7 Print/export case summary.** Separate task.
- **E8 "Client's other matters" chip.** Reads from `client_portal_contacts` (already firm-wide); render as a header chip. Small.

## Acceptance checks (run after implementation)
- StageRail: no "full timeline" button anywhere; phase chips toggle sub-stages with a visible chevron; removed stages absent from sub-lists and from the Advance dialog options.
- Case at `Recon decision approved` shows "No appeal deadline active" in status strip and Deadline panel; advancing a denied case to the next "filed" stage clears the prior deadline immediately.
- Sending a milestone email lands in a real inbox; an induced 401/failure shows a "delivery failed" badge on the Messaging panel for that message.
- Re-send portal invite is reachable only from the ⋯ menu.

## Decisions needed
1. **Cut list for §C** — confirm the 5 stages to remove (proposal above). If "Hearing prep" should stay, name the 5th to drop.
2. **§E scope** — ship E1-E4 now and defer E5-E8, or pick a different subset?
