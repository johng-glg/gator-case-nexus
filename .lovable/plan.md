# Persist the SSDI document checklist (off localStorage, onto Lovable Cloud)

Today the case Documents panel reads a hardcoded list and writes status to `localStorage` — per-browser, lost on device switch, invisible to the rest of the firm. The uploaded `documents.ts` engine + `documents.test.ts` tests + `lovable-document-checklist-prompt.md` are the spec. This plan wires them in end-to-end.

## What changes for the user

- The Documents panel on a case shows the same checklist for every firm user on every device.
- The list comes straight from the engine: a `Retained` case shows only intake docs; an ALJ-stage case reveals intake → recon → ALJ groups; as a case advances, new groups appear and stay.
- Status cycles **To do → Sent → Received → Filed**, persists in the database, and every change writes an audit-log entry visible in the case Activity panel.
- When SSA-1696 / SSA-827 finish e-signing (existing `formsService` hook), those two docs auto-flip to at least **Received** so the checklist and e-sign panel never disagree.

## What changes in the code

1. **Engine: drop in the new `documents.ts` + `documents.test.ts`**
   - New file `src/integrations/zoho/documents.ts` (exact contents from the upload): `DOCUMENT_CHECKLIST`, `DOC_STATUSES`, `documentsForPhase`, `documentByCode`, `documentsThroughStage`, `ChecklistDoc`, `DocStatus`.
   - New file `src/integrations/zoho/documents.test.ts` (exact contents from the upload), registered in the test runner alongside the existing `forms.test.ts` / `calendarService.test.ts`.
   - Delete `src/integrations/zoho/documentChecklist.ts` (superseded — UI is the only caller and we rewrite it below).

2. **Database: `case_document_status` table (Lovable Cloud migration)**
   - Columns: `case_id text`, `doc_code text`, `status text`, `updated_at timestamptz default now()`, `updated_by uuid`.
   - Primary key `(case_id, doc_code)`.
   - `status` constrained to the four engine values via a CHECK constraint.
   - Grants in the same migration: `GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated`, `GRANT ALL … TO service_role`. No `anon` (firm-only).
   - RLS enabled. Policies: any authenticated firm user can select/insert/update/delete (matches how other firm-side tables like `case_activity_log` are scoped today).
   - Helpful index: `(case_id)` for the per-case list query.

3. **Server functions (firm-guarded via `requireSupabaseAuth`)** — new file `src/lib/caseDocuments.functions.ts`:
   - `listCaseDocuments({ caseId, currentStage })` → call `documentsThroughStage(currentStage)`, left-join with `case_document_status` rows for that `case_id`, return `[{ code, label, phase, url, required, status, updatedAt }]` with default `"To do"`.
   - `setDocumentStatus({ caseId, docCode, status })` → validate `documentByCode(docCode)` exists and `status ∈ DOC_STATUSES`; upsert with `updated_by = auth.uid()`, `updated_at = now()`; then `logActivity({ caseId, type: "document_status_changed", payload: { docCode, status } })` via the existing `audit/log.server.ts` helper.
   - Both wired through the existing `attachSupabaseAuth` global middleware (already registered in `src/start.ts`).

4. **UI rewrite: `src/components/cases/DocumentChecklist.tsx`**
   - Remove all `localStorage` code and the local `DocStatus` enum.
   - `useQuery(["case-docs", caseId, stage], listCaseDocuments)` for the list.
   - `useMutation(setDocumentStatus)` for cycling status — optimistic update on the query cache, then invalidate `["case-docs", caseId]` and `["case-activity", caseId]`.
   - Group by `phase` in lifecycle order (use `PHASES` from `lifecycle.ts` for ordering and labels). Per-group `x of y filed` counter, required chip when `doc.required`, "PDF" link when `doc.url`.
   - Footer copy changes from "Status is tracked locally on this device" → "Status is shared across the firm."

5. **E-sign ↔ checklist sync** — in `src/integrations/zoho/formsService.ts`, after a form transitions to Signed for SSA-1696 / SSA-827, call `setDocumentStatus({ caseId, docCode, status: "Received" })` (only if its current stored status is `"To do"` or `"Sent"` — never downgrade `"Filed"`). This is a small server-side helper call; no UI change required.

6. **Changelog touch-up** — flip the existing entry in `src/lib/changelog.ts` that mentions "localStorage" to describe the new firm-wide persistence + audit-log entry.

## Validation

- `documents.test.ts` (the 7 assertions in the upload) runs green alongside the existing zoho test suite.
- Manual check on `/practices/ssdi/cases/{id}` for a `Retained` case → only intake group; advance the case to `Hearing scheduled` → intake + recon + ALJ groups appear; cycle a status → reload in a different browser → status persists; Activity panel shows a `document_status_changed` entry.
- Send the SSA-1696 retainer through the existing e-sign flow → after the webhook fires, the SSA-1696 row in the checklist flips to **Received** automatically.

## Acceptance (from the prompt)

- Statuses persist across browsers/devices and are visible to any firm user on the case. ✅
- Checklist content comes from the engine — adding a doc to `documents.ts` shows up in the UI with no component change. ✅
- Every status change writes a `case_activity_log` entry. ✅
- `Retained` case → intake only; ALJ-phase case → intake → recon → ALJ groups. ✅
