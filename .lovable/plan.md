# SSDI Module Build-Out — Ordered Plan

## What's already in place
- Lifecycle state machine (`src/integrations/zoho/lifecycle.ts`) — full SSA stage list from Intake → Closed with valid transitions.
- Deadline engine (`src/integrations/zoho/deadlines.ts`) — 65-day appeal math + federal-holiday rollover.
- Intake wizard (`/practices/ssdi/intake`) with conflict check + retainer step.
- Case list (`/practices/ssdi/cases`) and case detail with Stage Rail, Advance dialog, tasks, costs, retainer card.
- Zoho-backed engagements, contacts, cases, costs, referrals.

The skeleton is done. The plan below fills in the substance, ordered so each phase unlocks the next.

---

## Phase 1 — Deadlines & Tasks you can trust (foundation)
Without reliable deadlines + tasks, nothing else matters.

1. **Deadline detail panel on the case page** — show notice date, computed deadline, rule used (presumed receipt vs. documented receipt), and days remaining. Override flow with required reason + audit log entry.
2. **Tasks engine, end-to-end** — when a stage is entered, the lifecycle hooks already declare tasks; wire the runner to actually create them in Zoho, mark complete, reassign, and reopen. Today the rail advances but tasks aren't always materialized.
3. **Deadlines dashboard** (`/deadlines`) upgrade — At-risk (≤14 days), This week, Overdue, by attorney. Already partially wired; finish filters, sort, bulk reassign.
4. **Nightly deadline sweep** — server route at `/api/public/cron/deadline-sweep` (auth via `DEADLINE_SWEEP_SECRET`) that recomputes deadlines, flags overdue, and posts a daily digest. Stub exists — finish + schedule.

## Phase 2 — Stage workflow completeness
Make every stage transition do the right thing automatically.

1. **Per-stage required fields** — Advance dialog already accepts fields; define the schema per stage (e.g. Application filed requires `SSA_Claim_Number` + `Filed_On`; ALJ Hearing scheduled requires `Hearing_Date`, `Hearing_Type`, `ALJ_Name`, `Hearing_Office`).
2. **Side-effect runner** — on stage entry: set deadline, generate tasks, optionally request e-sign, optionally create calendar event. Drive entirely from `StageEffects` in `lifecycle.ts`; no per-stage if/else in components.
3. **Denial → next-tier auto-suggest** — when a "denied" stage is entered, prefill the next appeal's filing task with the computed deadline.
4. **Closed case workflow** — closure reason (Won / Lost / Withdrawn / Transferred), final disposition fields, lock further edits.

## Phase 3 — Documents & e-signature
SSDI runs on forms. This is where the time savings live.

1. **Document checklist per stage** — SSA-1696 (rep appt), SSA-827 (medical release), SSA-561 (recon), HA-501 (ALJ request), HA-520 (Appeals Council). Show checklist on case page; track received/sent/signed per doc.
2. **Zoho Sign integration** — secrets already exist (`ZOHO_SIGN_TEMPLATE_ID`, `ZOHO_SIGN_ACTION_ID`, `ZOHO_SIGN_WEBHOOK_SECRET`). Build: send-for-signature action, webhook receiver at `/api/public/webhooks/zoho-sign` that updates the case doc record on signed/declined.
3. **Document upload & storage** — Lovable Cloud Storage bucket per case for medical records, decision letters, exhibits. Tag with stage + document type.

## Phase 4 — Client experience
1. **Client portal (lightweight)** — magic-link login for the client to see case status, upcoming deadlines, and outstanding document requests. Reuses existing auth.
2. **Status-update messaging** — templated SMS/email on stage change (e.g. "Your hearing is scheduled for…"). Use existing connectors; opt-in per client.
3. **Document request flow** — attorney clicks "Request SSA-827 from client" → client gets link → uploads → appears on case.

## Phase 5 — Financials
1. **Costs module** — already scaffolded (Costs table on case page). Add: cost entry form, category, vendor, reimbursable flag, totals per case.
2. **Fee petition generator** — when "Award / NOA received" entered, pull case data + costs → produce a fee petition draft (PDF) using the existing back-pay/fee logic in `fees.ts`.
3. **Trust accounting export** — CSV export of costs by case for the bookkeeper, ready to push to Zoho Books (connector already supported).

## Phase 6 — Reporting & ops
1. **Pipeline report** — count + aging by stage, by attorney, by referral source.
2. **Win/loss analytics** — outcomes by ALJ, by hearing office, by impairment type.
3. **Referral-source ROI** — cases per source, conversion rate, gross fees, cost per acquisition.

---

## Suggested build order
Phase 1 → 2 → 3 is the critical path. Phase 4–6 can be reordered based on what the firm needs most. I'd recommend doing **Phase 1** first as a single push (1–2 work sessions) so the rest of the build sits on a foundation you can trust.

## Technical conventions to keep
- All Zoho field references go through `mem://reference/zoho-fields` — never invent API names.
- Never select or write 🔒 formula/rollup fields in COQL.
- Side-effects live in `lifecycle.ts`, runner in `caseService.ts`; components stay declarative.
- Cron / webhook routes under `/api/public/*` with signature verification.
- All new tables in Lovable Cloud get RLS + GRANTs in the same migration.

## Open questions before I start Phase 1
1. **Documented receipt date** — do you want a dedicated `Receipt_Date` field on Cases, or keep deriving from notice + 5?
2. **Task assignment default** — assign to case's primary attorney, or to a shared "SSDI ops" queue?
3. **Calendar** — sync hearings to Google Calendar (connector) or just keep in-app?
