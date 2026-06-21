## Phase 2 wiring — gap-fill plan

Most of the engine is already wired (`caseAdvance`, `StageRail`, `AdvanceStageDialog`, `deadline-sweep`, `deadlinesAtRisk` / `releasesExpiringSoon` queries, `getCase` record-GET). This plan closes the remaining gaps without touching the engines.

### 1. Expand `AdvanceStageDialog` requirements table
`src/components/cases/AdvanceStageDialog.tsx` — extend `STAGE_REQUIREMENTS` to cover every target stage from the spec:

| Stage | Fields |
|---|---|
| Application filed | `Application_Filed_Date*` |
| Reconsideration filed | `Recon_Filed_Date*` |
| Recon decision - approved | `Recon_Decision_Date*` |
| ALJ hearing requested | `ALJ_Hearing_Requested_Date*` |
| Hearing scheduled | `ALJ_Hearing_Scheduled_Date*`, `Hearing_Office_ODAR` (text), `ALJ_Name` (text) |
| Hearing held | `ALJ_Hearing_Held_Date*` |
| ALJ decision - approved | `ALJ_Decision_Date*` |
| Appeals Council requested | `Appeals_Council_Requested_Date*` |
| AC decision - approved | `AC_Decision_Date*` |
| Award / NOA received | `Notice_of_Award_Date*`, `Back_Pay_Amount*` (number), `Monthly_Benefit` (number), `Entitlement_Date` (date) |
| Fee petition filed | `Fee_Petition_Filed_Date*` |
| Closed | `Closure_Reason*` (text), `Closure_Notes` (textarea); also inject `Is_Closed = true` |

Add `type: "text" | "number" | "textarea"` to the requirement shape (currently only `"date"`) and render the corresponding input.

On the denied-stage groups (Initial / Recon / ALJ / AC denied), show a one-line helper directly below the field list:
> "Enter the date printed on the SSA notice — the 60-day appeal deadline is computed from it."

When `Closed` is selected, the dialog merges `Is_Closed: true` into the submitted fields.

### 2. New server fns + COQL query for tasks
`src/lib/zoho-queries.ts` — add a `tasksByCase` query:
```
select id, Subject, Due_Date, Status
from Tasks
where What_Id = {caseId} and Status != 'Completed'
order by Due_Date asc
```
Add `"tasksByCase"` to the `QueryName` union and the `queryInput` enum in `zoho.functions.ts`.

`src/lib/zoho.functions.ts` — add `completeTask` server fn (POST, auth-gated):
```ts
completeTask({ taskId }) → api.updateRecords("Tasks", [{ id, Status: "Completed" }])
```

### 3. Case detail panels
`src/routes/_authenticated/practices.ssdi.cases.$caseId.tsx`:

- **Tasks panel** (new) — `useQuery({ name:"tasksByCase", params:{ caseId } })`; render Subject + Due_Date with a "Mark complete" button calling `completeTask` and invalidating `["tasks", caseId]`. Also invalidated after every `onAdvance`.
- **Fees panel** — drop the client-side `ssdiProjectedFee` / `ssdiUserFee` computation; read `record.Projected_Fee`, `record.User_Fee_Withheld`, `record.Back_Pay_Amount` straight from `getCase` (those are Zoho formula fields, populated on the record). Keep the same Row layout, remove the "(preview)" label.
- **HIPAA panel** (new) — show `Release_Signed_Date`, `Release_Expiration_Date`, and a red "Expiring soon" badge when `Release_Expiring_Soon === true`.

### 4. Out of scope (already done, leave alone)
- `caseAdvance` server fn — done
- `/api/public/deadline-sweep` route — done
- `Deadlines` page with at-risk + expiring-releases sections — done
- `StageRail` rail UI — done
- The engines themselves (`lifecycle.ts`, `deadlines.ts`, `fees.ts`, `caseService.ts`)

### 5. External cron
Not a code change — note in the closing message that the user needs to point a daily scheduler (cron-job.org or pg_cron) at `https://gator-case-nexus.lovable.app/api/public/deadline-sweep` with header `Authorization: Bearer $DEADLINE_SWEEP_SECRET`. The secret must be set via `add_secret`; I'll surface it if not already present.

### Acceptance
After build: open a test case → Advance to "Application filed" (date prompt), then "Initial decision - pending", then "Initial decision - denied" (Notice_Date + Initial_Decision_Date prompts). Verify (a) Deadline panel populates with date = notice+65 rolled, (b) Tasks panel shows "File reconsideration" due deadline−5, (c) `/deadlines` lists the case once `Deadline_At_Risk` flips (≤14d) or after the sweep runs.
