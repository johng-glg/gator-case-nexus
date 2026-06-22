# Robust Lead Management — Phased Plan

The qualification engine (`leadScreening.ts`) is fully specified in the message. The rest of the work is wiring it into Zoho, the UI, and a real workflow.

I recommend shipping this in **4 phases** because it's a lot. Phase 1 alone is meaningful and unblocks the rest.

---

## Phase 1 — Screener + Scoring + Convert Gate (ship now)

The highest-leverage piece, self-contained, no Zoho admin work outside adding fields.

### Engine
- Create `src/integrations/zoho/leadScreening.ts` with the exact engine from the message (imports `asUTCDate`, `daysUntil` from `./deadlines`).
- Add `src/integrations/zoho/__tests__/leadScreening.test.ts` mirroring the spec: SGA knockout, duration knockout, no-treatment caution, DLI-expired caution, already-represented caution, age ≥55 boost, urgent flag, Decline vs Strong vs Marginal vs Needs review, score bounds.

### Zoho custom fields (Leads module)
You'll need to add these to the Leads layout in Zoho (one-time, manual in Zoho admin — I'll provide the exact API names + types):

| API Name | Type |
|---|---|
| `Working_Above_SGA` | Boolean |
| `Monthly_Earnings` | Currency |
| `Is_Blind` | Boolean |
| `Receiving_Treatment` | Boolean |
| `Meets_12mo_Duration` | Boolean |
| `Claim_Type` | Picklist (DIB, SSI, Concurrent, Unknown) |
| `Date_Last_Insured` | Date |
| `Already_Represented` | Boolean |
| `Date_of_Birth` | Date |
| `Current_Level` | Picklist (No application yet, Initial pending, Initial denied, Recon denied, ALJ denied, Other) |
| `Appeal_Deadline_Date` | Date |
| `Primary_Impairment` | Text |
| `Lead_Tier` | Picklist (Decline, Strong, Marginal, Needs review) — app-written |
| `Lead_Score` | Number — app-written |
| `Screener_Knockouts` | Multi-line text — app-written |
| `Is_Urgent` | Boolean — app-written |

I'll add a checklist component to surface this on first run.

### Server functions (`src/lib/zoho.functions.ts`)
- `saveLeadScreener({ leadId, input })`: validate with Zod, write screener fields + run `screenLead()`, write `Lead_Tier` / `Lead_Score` / `Screener_Knockouts` / `Is_Urgent` back to Zoho, return `ScreenResult`.
- Extend `getLead` to project the new fields.
- Tighten `convertLead`: load lead, read `Lead_Tier`, throw if `Decline` unless `override: { reason: string }` passed; log the override into `case_activity_log`.

### UI (`src/routes/_authenticated/leads.$leadId.tsx`)
- New `ScreenerPanel` component (form: SGA/earnings, blind, treatment, duration, claim type, DLI, represented, DOB→age, current level, appeal deadline, impairment).
- Live tier badge, score, knockout chips, reasons list (re-runs `screenLead` client-side as user edits — engine is pure).
- "Save & qualify" button calls `saveLeadScreener`; on success toasts tier and (if not Decline) flips Lead_Status to Qualified.
- Convert button disabled when tier === Decline; "Override and convert" secondary action prompts for a reason.

---

## Phase 2 — Pipeline stages + decline/referral

- Expand Lead_Status enum: `New, Attempting contact, Contacted, Screening, Qualified, Retainer sent, Converted, Disqualified, Nurture, Lost`. Requires picklist edit in Zoho — I'll list the values.
- `Lead_Contact_Attempts` numeric + `logContactAttempt` server fn (increments, creates a follow-up task).
- Kanban view at `/leads` grouping by stage with drag-to-advance.
- `Decline_Reason` picklist + decline action that sets Disqualified + reason (prefilled from knockouts) + optional refer-out (Referrals module already exists).

## Phase 3 — Speed-to-lead automation

- Round-robin assignment on lead create (config in a new `lead_assignment_rules` table).
- Auto-reply email via existing transactional email infra.
- SLA timer + breach escalation task. Likely a `pg_cron` sweep over leads with `Created_Time > now() - 30min AND last_contacted IS NULL`.
- Nurture sequence scheduler (cron + a `lead_nurture_schedule` table).

## Phase 4 — Web-to-lead + reporting + call tracking

- Public `/api/public/web-to-lead` POST endpoint w/ Zod + Turnstile/honeypot; creates Lead with source params.
- Embeddable form snippet (Tailwind, copy-paste).
- Funnel report (`/practices/ssdi/reports/funnel`) by source, intake staff, practice area: lead → screened → qualified → retainer sent → converted, plus speed-to-lead median, contact rate, tier mix, stuck-stage aging.
- CallRail/Aircall webhook → Lead (separate connector decision later).

## TCPA consent (folded into Phase 1)

Add a "SMS consent" checkbox + exact-language disclosure to the screener form. On save, write a row into existing `client_messaging_consent` (lead_id, channel='sms', granted_at, source, exact_text). No texts sent yet — just proof of consent stored before Phase 2b SMS work.

---

## Technical notes

- Engine stays pure (already tested style — assertion file). UI re-evaluates on every field change for instant feedback; server re-evaluates on save (source of truth).
- Convert gate enforced server-side in `convertLead`, not just in the UI button disabled state.
- Zoho field additions are the only manual step — everything else is code.

---

## Recommendation

**Ship Phase 1 today.** It's ~3-4 files, gets the screener in front of users, and validates the field design before we expand the pipeline stages. Approve and I'll build Phase 1; we can re-plan Phase 2 once you've used the screener for a few real leads.

Want me to proceed with Phase 1 only, or all four phases as one large change?
