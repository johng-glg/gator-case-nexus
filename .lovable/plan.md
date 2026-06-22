## Port plan — Gator ssdi-engine → Lovable

Treat the engine bundle as the source of truth. Recreate each file verbatim at the listed path; no redesign, no UI work until tests are green.

### Step 1 — Extract the bundle
Split `pasted-2026-06-22T16-51-29-947Z.txt` into the 15 destination files using the `## \`src/...\`` section headers. Write each section's fenced TS block verbatim to its destination path. Files (in dependency order from the bundle):

1. `src/integrations/zoho/deadlines.ts` — REPLACE (A1: generic-year holidays, adds `isFederalHoliday`)
2. `src/integrations/zoho/lifecycle.ts` — REPLACE (A2 de-dash + B1: `REQUIRED_FIELDS`, `missingRequiredFields`, `missingRequiredFieldsDetailed`, `FIELD_LABELS`, `MissingField`)
3. `src/integrations/zoho/zohoClient.ts` — REPLACE only if signatures match; otherwise diff and merge to preserve existing token-store wiring
4. `src/integrations/zoho/zohoSignAdapter.ts` — REPLACE (per-call `templateId`/`actionId` override required by formsService)
5. `src/integrations/zoho/retainerService.ts` — REPLACE (exports `parseSignWebhook`)
6. `src/integrations/zoho/caseService.ts` — REPLACE (exports `RequiredFieldsError`, wires `missingRequiredFieldsDetailed` into `advanceStage`, de-dashed)
7. `src/integrations/zoho/intakeService.ts` — REPLACE (B2: `createSsdiCaseOpener`, `runConflictCheck`, `createIntake`, `convertLead`)
8. `src/integrations/zoho/formsService.ts` — REPLACE (B3: `gatorIntakeForms`, `createFormsService`, `sendIntakeForms`, `handleFormSigned`)
9. `src/integrations/zoho/signWebhookSecurity.ts` — port if missing/divergent
10. `src/integrations/zoho/calendarService.ts` — ADD/REPLACE (pure `desiredEventsForCase`/`reconcile`/`signature`)
11. `src/integrations/zoho/calendarSyncService.ts` — ADD (B4: `createCalendarSyncService` with pluggable `cal` + `links`)
12. `src/integrations/zoho/messagingService.ts` — REPLACE (de-dashed rules engine)
13. `src/integrations/zoho/notificationService.ts` — ADD (B5: `createNotificationService` / `notify`)
14. `src/integrations/zoho/documents.ts` — port if missing/divergent
15. `src/integrations/zoho/credentialsService.ts` — port if missing/divergent

### Step 2 — Webhook + sweep rewire (minimum to compile)
- `src/routes/api/public/webhooks/zoho-sign.ts`: replace inline case-open logic with `createSsdiCaseOpener(...).open(...)` then `forms.sendIntakeForms(...)`.
- `src/integrations/zoho/caseCalendarSync.ts`: route each open case through the new `createCalendarSyncService().syncCase(...)`; keep the sweep entry point.
- Sweep TS for any remaining dashed stage literals (`"Initial decision - "`, Recon/ALJ/AC variants) in `.ts`/`.tsx` and de-dash. Components touched: `DenialNextStepBanner.tsx`, `StageRail.tsx`, `AdvanceStageDialog.tsx`. No UI redesign — string-only.

### Step 3 — Test harness
The bundle references test suites that live in the `ssdi-engine/` reference repo, not this tree. To run them here:
- Extract the test files alongside the engine (need user to confirm: drop them under `src/integrations/zoho/__tests__/` or a sibling `ssdi-engine/` folder?).
- Use the existing vitest setup (`bunx vitest run src/integrations/zoho`) to execute.

### Step 4 — Verification gate (definition of done)
Run and report pass/fail per suite:
- `holidays.test.ts`, `invariants.test.ts`, `phasetest.ts`, `tests.ts`
- `caseService.test.ts`, `recompute.test.ts`
- `intake.test.ts`, `convertlead.test.ts`, `retainer.test.ts`
- `forms.test.ts`
- `calendar.test.ts`, `calendarsync.test.ts`
- `notification.test.ts`, `messaging.test.ts`
- `documents.test.ts`
- **`ssdi-e2e.test.ts`** — the spine

Report which pass before any UI (C9–C12) work begins.

### Open question before I start
The port pack names 18 test suites but only the engine source is in the upload. **Do you want me to:**
**(a)** port engines now and stop at "compiles + typechecks", flagging that tests can't run until you paste the test files, or
**(b)** wait for you to also upload the `ssdi-engine/*.test.ts` bundle so I can port engines + tests together and actually run the gate in step 4?

Option (b) is the only way to honor "report which pass before wiring any UI."
