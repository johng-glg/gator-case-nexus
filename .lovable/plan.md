# SSDI case page reorg + intake automations

Two parallel workstreams. They share nothing structurally and can land in one pass.

---

## Part A — Case page reorg (`practices.ssdi.cases.$caseId.tsx`)

Rebuild the page top-down so above the fold is **orient + act**, and reference data is pushed below.

### A1. Header
- Keep: case # / client link + primary **Advance stage**.
- Move into a new `<CaseActionsMenu>` overflow (⋯) component: *Invite to portal*, *Recompute deadline*, *Fee petition draft*, *Seed test data*, and a new **Run intake playbook** (admin-only — gated by `has_role('admin')`; "Seed test data" already hidden in prod via the same gate).

### A2. Status strip (NEW — `<CaseStatusStrip>`)
A single thin row directly below the header:
`current-stage chip · deadline countdown (green ≥30d / amber 8-29d / red ≤7d or overdue) · flag chips`
Flag chips derived from the case record:
- Retainer ✓ (from engagement Retainer_Status)
- SSA-1696 *pending* / *signed*
- SSA-827 *needs attestation* (when status = Not sent) / *expiring* (Release_Expiring_Soon)
- Open tasks (N) — links to tasks panel
- Welcome email *queued* / *sent*

When no appeal clock is active: show "No appeal deadline active".

### A3. Lifecycle rail
Keep `<StageRail>`, but inside the "Intake & filing" phase add a collapsible **Show sub-steps** disclosure (default collapsed). Other phases unchanged.

### A4. Above-the-fold action row (two-column grid)
- **Left — Appeal Deadline**: keep `<DeadlinePanel>` only when an appeal clock is running. When stage = "Retained" and no clock, render a new `<NextStepCard>`: "File SSA application" + the required fields (SSA_Claim_Number) with an Advance-to-Application-filed shortcut.
- **Right — Action Center (NEW `<ActionCenter>`)**: prioritized vertical list, each row = label + inline button:
  - Send SSA-1696 (hidden when Signed) — wraps current SsaFormsPanel send action
  - SSA-827 — *needs attestation* row (always until Signed) — opens the attestation confirm dialog
  - Open tasks (N) → jumps to tasks panel
  - Request documents from client (opens DocumentRequestsPanel new-request dialog)
  - Invite to portal (only if no portal link yet)

### A5. Demote Case facts (collapsible `<details>` or shadcn `<Collapsible>` default closed)
New "Case facts" section containing the existing **SSA case data** and **Lifecycle dates** panels, side-by-side inside it. Removed from ATF grid.

### A6. Unify Forms & Documents — kill duplication
New `<FormsAndDocumentsPanel>` (replaces `SsaFormsPanel` + the form rows inside `DocumentChecklist`):
- One row per form (SSA-1696, SSA-827, SSA-1693 if firm uses it, retainer): columns = **E-sign status** (Not sent/Sent/Signed) · **Checklist status** (To do/Sent/Received/Filed) · **Action** (Send/Resend).
- `DocumentChecklist` keeps non-form items (medical records, photo ID, etc.) only.

### A7. Drop the standalone HIPAA panel
Show `Release_Signed_Date` + `Release_Expiration_Date` + `Release_Expiring_Soon` flag inline on the SSA-827 row of the new Forms panel. Delete the separate HIPAA `<Panel>`.

### A8. De-duplicate Notice Date
Canonical editable field lives on the new Case facts section. Remove `Notice_Date` from the "SSA case data" duplicate rendering and from the Deadline panel's inline display — both render it read-only by reading the same field from the case record. (The editable input stays in the Advance dialog as before.)

### A9. Empty-state polish
Wrap Costs / MedicalRecordsPanel / MessagingPanel / ActivityPanel in a `<CollapsibleSection emptyWhen={...}>` helper. When empty, render a single-line summary ("No costs recorded — Add cost") instead of a full empty card. Expanded automatically when content exists.

### File touches (Part A)
- Edit: `src/routes/_authenticated/practices.ssdi.cases.$caseId.tsx` (top-to-bottom rewrite of the JSX layout; logic untouched).
- New components in `src/components/cases/`: `CaseActionsMenu.tsx`, `CaseStatusStrip.tsx`, `NextStepCard.tsx`, `ActionCenter.tsx`, `FormsAndDocumentsPanel.tsx`, `CollapsibleSection.tsx`.
- Edit: `StageRail.tsx` to add the sub-step disclosure inside the Intake phase.
- Edit: `DocumentChecklist.tsx` to drop SSA forms (they move to the new panel).
- Delete from layout: the standalone HIPAA Panel + duplicate Notice Date rows.

---

## Part B — `onCaseOpened(caseId)` intake playbook

### B1. New module `src/integrations/zoho/caseIntakeService.ts`
Exports `onCaseOpened({ caseId, actor }: { caseId: string; actor: string })`. Each step is wrapped in try/catch + activity-log entry, and gated by an idempotency check so re-running is safe. Steps:

1. **SSA-1696 e-sign** — `formsService.sendForm(actor, caseId, "SSA-1696")` only when `SSA1696_Status === "Not sent"`. Uses the existing forms service so the email goes out via Zoho Sign exactly like manual send.
2. **SSA-827 prepare** — no send. Ensure `SSA827_Status` defaults to `"Not sent"`; surface "needs attestation" via the Action Center flag.
3. **Task bundle** from `HOOKS["Retained"].tasks` plus the three new tasks the spec calls out (Verify insured status/DLI +3, Confirm work/SGA status +3, Collect medical provider list +7, File SSA application +14). Add the three to `HOOKS["Retained"]` so the lifecycle table stays the single source of truth. Resolve due dates via existing `DueRule` resolver (`fieldPlus Date_Opened`). Idempotent: skip if a Task with the same Subject already exists on the case.
4. **Auto-invite to portal** — reuse `autoInvitePortal` from `src/integrations/portal/autoInvite.server.ts` (added previously). Idempotent: skip if `client_portal_links` row exists for the engagement; otherwise create, then call `fillCaseIdOnLink({engagementId, caseId})` so the link points at the new case immediately.
5. **Welcome-packet email** — new React Email template `src/lib/email-templates/ssdi-welcome-packet.tsx` registered in `registry.ts`. Subject: *Welcome to Gator Law — your Social Security disability case*. Body covers what's next, rough timeline, and the dos/don'ts (keep seeing doctors, don't exceed SGA, list every provider, forward every SSA letter, use the portal). Sent via the existing `/lovable/email/transactional/send` route with `idempotencyKey: ssdi-welcome-${caseId}` so retries don't double-send. Skip if `email_send_log` already has a row for that key.
6. **Intake questionnaire email** — second template `ssdi-intake-questionnaire.tsx` with a CTA link to `/portal/intake?case={caseId}`. Same idempotency-key pattern. The portal page itself (the questionnaire form) is a separate ticket; this turn ships the email + a stub portal route that records the case id and renders "Questionnaire coming soon" so the link doesn't 404. *Flagged in the plan as a stub — let me know if you want the full form built in this same pass.*
7. **Document request** — insert one `document_requests` row via `supabaseAdmin` with `caseId`, `engagementId`, `label = "Standard SSDI intake documents"`, `instructions` enumerating the items (photo ID, recent medical/work records, prior SSA correspondence). Idempotent: skip if a request with the same label already exists on the case.
8. **SSA-1693** — only when firm setting `fee_vehicle === "SSA-1693"` (default off). Reuses `formsService.sendForm(actor, caseId, "SSA-1693")` once `gatorIntakeForms` exposes it.
9. **Carry forward lead/screener data** — read the engagement → lead → `parseScreenerBlock(lead.Description)` and update `SSDI_Cases` with `Claim_Type`, `Onset_Date`, `Last_Worked_Date`, `Primary_Impairment`, `Disability_Type`. Idempotent: only write fields currently blank on the case.
10. **Internal notification** — insert a `case_activity_log` row of `action="case.opened"` with `summary = "New SSDI case opened: {client}"` (already used by ActivityPanel — no new UI surface needed). If the assigned attorney/paralegal has an email on file in Zoho Users, also queue a transactional `internal-case-opened.tsx` email.
11. **Activity log** — every step above logs success/failure into `case_activity_log` so the audit trail is one-stop.

### B2. Settings → Intake Automations panel
- New route: `src/routes/_authenticated/settings.intake-automations.tsx`.
- New table `firm_intake_settings` (single row, keyed by `firm_id = 'default'`): toggles for `welcome_email`, `questionnaire_email`, `auto_portal_invite`, `send_ssa1693`, `internal_notification`. Defaults: all on except `send_ssa1693`.
- `onCaseOpened` reads this row at the start and skips disabled steps.

### B3. Wiring
- **Retainer-signed webhook**: in `signClient.server.ts` `onRetainerSigned`, after the existing `fillCaseIdOnLink` call, call `onCaseOpened({caseId, actor: SERVICE_ACTOR})` instead of `sendIntakeForms` (the playbook subsumes it). Existing `sendIntakeForms` call removed.
- **Manual trigger**: new `runCaseOpenedPlaybook` server fn (admin-only via `has_role`). The Case page header overflow ("Run intake playbook") and the `Seed test data` flow both call it, so seeded cases get the same emails/tasks.

### B4. Acceptance verification
- New unit test `src/integrations/zoho/__tests__/case-intake.test.ts` covering: first run fires all steps; second run is a no-op; SSA-827 stays Not sent; toggling `send_ssa1693` off skips it.
- Manual smoke: open a seeded case, click Run intake playbook, confirm Activity log shows the 1696 send, welcome email, questionnaire email, doc request, 4 tasks, portal invite — then click again, log shows "already done" entries with no duplicate side effects.

### File touches (Part B)
- New: `src/integrations/zoho/caseIntakeService.ts`, `src/lib/email-templates/ssdi-welcome-packet.tsx`, `src/lib/email-templates/ssdi-intake-questionnaire.tsx`, `src/lib/email-templates/internal-case-opened.tsx`, `src/routes/_authenticated/settings.intake-automations.tsx`, `src/routes/_client/portal.intake.tsx` (stub), `src/integrations/zoho/__tests__/case-intake.test.ts`.
- Edit: `src/integrations/zoho/lifecycle.ts` (add the 3 extra tasks to `HOOKS["Retained"]`), `src/integrations/zoho/formsService.ts` (expose SSA-1693 in `gatorIntakeForms`), `src/integrations/zoho/signClient.server.ts` (call playbook instead of `sendIntakeForms`), `src/lib/email-templates/registry.ts` (register 3 templates), `src/lib/zoho.functions.ts` (add `runCaseOpenedPlaybook`, hook into `seedTestCaseData`).
- Migration: create `firm_intake_settings` with grants + RLS (staff read/update via `has_role('admin')`), seed one default row.

---

## Open question I'd like to confirm before building

**#6 Intake questionnaire** is the only step that's not just plumbing — it's a whole structured form (disability history, work history, meds, providers) with persistence that seeds the Medical Records module. Plan above ships the **email + stub portal page** so the rest of the playbook is end-to-end working; I'd build the actual form as a follow-up. If you want the full questionnaire form in this same pass, say so and I'll expand step B1.6 with the form schema, persistence table, and Medical Records seeding logic.
