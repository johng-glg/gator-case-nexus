export type ChangelogEntry = {
  date: string; // YYYY-MM-DD
  title: string;
  summary?: string;
  changes?: string[];
};

/**
 * Append new entries to the TOP of this array.
 * Keep entries concise — this log is shared with external collaborators.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-06-21",
    title: "SSDI: case activity log (audit trail)",
    summary:
      "Every staff-side change to an SSDI case is now recorded — visible per case and firm-wide.",
    changes: [
      "New case_activity_log table (RLS: firm staff only; clients cannot see it).",
      "Instrumented mutations: stage advance, case-date edits, cost add/delete, task create/complete/reopen/reassign, and client-portal invites.",
      "New 'Activity' panel on the case page shows the latest 100 events for that case (or its engagement).",
      "New Settings → Activity Log tab: firm-wide feed with action / actor / search filters and one-click CSV export.",
      "Logging is fire-and-forget: an audit-write failure never breaks a mutation.",
    ],
  },
  {
    date: "2026-06-21",
    title: "SSDI: lightweight client portal (Phase 4.1)",
    summary:
      "Clients can sign in with a magic-link email to see their case status, current stage, deadline, and hearing details — read-only.",
    changes: [
      "New /portal route at a separate /_client layout (non-firm emails only); firm staff are bounced back to /dashboard.",
      "Staff get an 'Invite to portal' button on the case page that emails the client a magic-link sign-in and binds their auth account to the case via the new client_portal_links table (RLS: clients can only see their own row).",
      "Re-invite works for already-registered clients (issues a fresh magic-link instead of erroring).",
      "Returning clients can request a new link at /client-auth.",
      "Portal view exposes case number, current stage, deadline + days remaining, ALJ hearing details, Notice of Award date, and assigned attorney — no fees, no internal notes.",
      "Portal reads Zoho via the SERVICE actor so clients don't need a Zoho grant of their own.",
    ],
  },
  {
    date: "2026-06-21",
    title: "SSDI: referral-source ROI (Phase 6.3)",
    summary:
      "Engagements, win rate, and projected fees grouped by referral source — completing the Phase 6 reporting set.",
    changes: [
      "New report at /practices/ssdi/reports/referrals, linked from the cases list.",
      "Columns: Engagements, Open, Won, Lost, Conversion (won ÷ engagements), Win rate (won ÷ decided), Gross fees, Net fees, Avg fee per win.",
      "Gross fees use §406(a) cap (lesser of 25% of Back_Pay_Amount or $9,200); net fees subtract the SSA user fee per fees.ts.",
      "New whitelisted COQL query (ssdiEngagementsWithReferral); closedCases extended with Back_Pay_Amount and Engagement.Referral_Source.Name.",
      "CSV export of the active view. Cost-per-acquisition column intentionally deferred until marketing spend is tracked per source.",
    ],
  },
  {
    date: "2026-06-21",
    title: "SSDI: win/loss analytics (Phase 6.2)",
    summary:
      "Closed-case win rates and time-to-close by ALJ, hearing office, primary impairment, or attorney — with CSV export.",
    changes: [
      "New report at /practices/ssdi/reports/outcomes, linked from the cases list.",
      "Toggle grouping: ALJ / Hearing office / Primary impairment / Attorney. Each row shows Closed, Won, Lost, Other, win rate, a win/loss bar, and average days from Date_Opened to Final_Disposition_Date.",
      "Year filter on Final_Disposition_Date. Withdrawn / Transferred / Deceased / Conflict counted as Other and excluded from win-rate denominator.",
      "New whitelisted COQL query (closedCases) pulling ALJ_Name, Hearing_Office_ODAR, Primary_Impairment, Closure_Reason, and attorney lookup.",
    ],
  },
  {
    date: "2026-06-21",
    title: "SSDI: pipeline report (Phase 6.1)",
    summary:
      "Open-case counts and age-in-stage distribution grouped by stage, phase, attorney, or referral source — with CSV export.",
    changes: [
      "New report at /practices/ssdi/reports/pipeline, linked from the cases list.",
      "Toggle grouping: Stage / Phase / Attorney / Referral source. Each row shows count, avg / median / oldest age (days since Date_Opened), and a 0–30 / 31–90 / 91–180 / 181–365 / >365 day distribution.",
      "Pulls live from Zoho via a new whitelisted COQL query (pipelineCases) with attorney and referral-source lookups.",
      "One-click CSV export for the active grouping.",
    ],
  },
  {
    date: "2026-06-21",
    title: "SSDI: trust accounting CSV export (Phase 5.3)",
    summary:
      "Per-case and firm-wide cost exports as CSV, ready for the bookkeeper or Zoho Books import.",
    changes: [
      "Per-case 'Export CSV' button on the case page Costs section — exports Date, Description, Category, Amount, Case.",
      "New Settings → Trust Export page lists every cost across all engagements with a date-range filter, running total, and one-click CSV download (Date, Client, Case, Description, Category, Amount).",
      "Pulls live from Zoho via a new whitelisted COQL query (allCosts) with client + engagement lookups.",
    ],
  },
  {
    date: "2026-06-21",
    title: "SSDI: fee petition draft generator (Phase 5.2)",
    summary:
      "Cases in the Award phase get a one-click printable fee petition draft pulling claimant, fee math, and costs.",
    changes: [
      "New 'Fee petition draft' button appears on the case page when stage is 'Award / NOA received' or 'Fee petition filed'.",
      "Printable page at /practices/ssdi/cases/:id/fee-petition shows claimant + SSA claim info, fee calculation (25% of past-due vs. $9,200 cap, less SSA user fee), itemized case costs with total, and signature block.",
      "Print / Save as PDF via the browser — no extra dependencies. Time & services section is a stub for itemization before filing.",
    ],
  },
  {
    date: "2026-06-21",
    title: "SSDI: cost entry on case page (Phase 5.1)",
    summary:
      "Attorneys can add and remove case costs directly from the case page; writes go straight to the Zoho Costs module.",
    changes: [
      "New 'Add cost' inline form on the case-page Costs section: Description + Amount + Category (Medical records / Expert / Postage / Filing fee / Travel / Copies / Other).",
      "Per-row delete button on existing costs (hidden on closed cases).",
      "Costs are linked to the engagement (Costs.Engagement). Note: the Costs module has no Date_Incurred field, so entry date is implicit (Created_Time).",
    ],
  },
  {
    date: "2026-06-21",
    title: "SSDI: per-stage document checklist (Phase 3.1)",
    summary:
      "Case page now shows required SSA / OHO documents grouped by lifecycle phase, with per-doc status tracking.",
    changes: [
      "New Documents panel on the case page lists SSA-1696 / SSA-827 / Retainer (Intake), SSA-561 / SSA-3441 (Recon), HA-501 / HA-520 / pre-hearing brief (ALJ), HA-520 / AC brief (Appeals Council), and fee petition (Award).",
      "Each doc cycles through To do → Sent → Received → Filed; status persists per case in localStorage. Phase groups appear once the case reaches that phase and stay visible thereafter.",
      "Direct PDF links to the official SSA forms where available.",
    ],
  },
  {
    date: "2026-06-21",
    title: "SSDI: stage workflow completeness (Phase 2.2–2.4)",
    summary:
      "Denial stages now suggest the next-tier filing in one click, closure captures a structured disposition, and closed cases are locked to edits.",
    changes: [
      "2.2 — Side-effect runner stays the single source of truth: stage-entry effects (deadline, tasks, e-sign, calendar) are still driven by HOOKS in lifecycle.ts; no per-stage branching in components.",
      "2.3 — Denial → next-tier auto-suggest: persistent banner above the Stage Rail (with deadline + days remaining, color-shifts inside 14/0 days) AND a toast right after the advance with a one-click action that opens the Advance dialog preselected to the next filing stage with today's date prefilled.",
      "2.4 — Closed case workflow: Closure reason is now a picklist (Won / Lost / Withdrawn / Transferred / Client deceased / Conflict), Final disposition date is required, Closed cases show a read-only banner and the Advance button is hidden (Notes and Costs remain editable).",
      "2.1 placeholder — new Admin → Stage Requirements tab lists the per-stage field schema with an explicit 'to do' (make it editable, add validation rules, sync from Zoho metadata).",
      "Hearing scheduled now also asks for Hearing_Type; Application filed now also asks for SSA claim number.",
    ],
  },
  {
    date: "2026-06-21",
    title: "SSDI: nightly deadline sweep + digest (Phase 1.4)",
    summary: "Automatic nightly recompute of SSDI deadlines with an admin-visible digest of overdue / due-soon / expiring releases.",
    changes: [
      "Scheduled pg_cron job 'ssdi-deadline-sweep-nightly' POSTs /api/public/deadline-sweep every day at 6:00 AM ET.",
      "Sweep persists results (scanned, updated, overdue, due ≤7d, release ≤30d) to ssdi_deadline_digests.",
      "New Admin → Deadline Sweep page shows the latest run, urgent case lists, run history, and a 'Run sweep now' button (admins only).",
    ],
  },
  {
    date: "2026-06-21",
    title: "SSDI: collapsed Intake + Retainer signed into 'Retained'",
    summary: "Retainers are signed before the case is created, so the first SSDI stage is now 'Retained'.",
    changes: [
      "New starting stage 'Retained'; legacy 'Intake' and 'Retainer signed' cases display and behave as 'Retained' via in-code mapping.",
      "Updated state machine: Retained → Application filed → … (transitions, hooks, and phase rail updated).",
      "New case creation writes Current_Stage = 'Retained'.",
    ],
  },
  {
    date: "2026-06-21",
    title: "SSDI: deadlines dashboard upgrade (Phase 1.3)",
    summary:
      "The /deadlines page now triages at a glance — urgency buckets, mine-only filter, tier grouping, and a new upcoming-hearings section.",
    changes: [
      "Four clickable summary cards at the top: Overdue, Due ≤7 days, Due ≤14 days, Due ≤30 days. Click any card to filter the list to that bucket.",
      "Filter bar: search by case number / client / attorney, tier filter (Reconsideration / ALJ Hearing / Appeals Council / Federal Court), and a Mine-only toggle that scopes to the signed-in attorney's cases.",
      "Appeal deadlines now grouped by tier with the assigned attorney and client visible per row; days-left turns amber inside 14 days and red inside 7 days or past due.",
      "New 'Upcoming ALJ hearings' section — next 60 days, soonest first, with date, hearing office, and ALJ name.",
      "New whitelisted COQL queries: myDeadlines (filters by Assigned_Attorney = current user) and upcomingHearings.",
      "Existing deadline queries now also return Assigned_Attorney and Engagement.Name so the dashboard can show who owns each clock.",
    ],
  },
  {
    date: "2026-06-21",
    title: "SSDI: tasks engine end-to-end (Phase 1.2)",
    summary:
      "Tasks panel on SSDI cases is now fully interactive — add, reassign, complete, and reopen, with proper ownership.",
    changes: [
      "Stage-driven tasks created during an advance are now auto-assigned to the case's Assigned Attorney (instead of falling to whoever clicked the button), with Priority defaulted to High.",
      "Redesigned Tasks panel on the case page: shows owner, priority, due date, color-coded days-to-due (amber within 3 days, red if overdue) and a strikethrough completed state.",
      "Per-task actions: Complete, Reopen (one click to bring a closed task back), and Reassign to any active Zoho user via a popover picker.",
      "Add Task form inline on the panel — sets Subject, Due Date, Priority, and Owner (defaults to current user). Creates the Task in Zoho linked to the case.",
      "Toggle to show / hide completed tasks; completed count visible in the header.",
      "New server functions: reopenTask, reassignTask, createCaseTask, listZohoUsers (active users from Zoho for the assignment pickers).",
    ],
  },
  {
    date: "2026-06-21",
    title: "SSDI: redesigned deadline panel (Phase 1.1)",
    summary:
      "First slice of the SSDI module build-out — make the appeal deadline trustworthy at a glance.",
    changes: [
      "New Deadline panel on the SSDI case page: large days-remaining number that turns amber inside 30 days and red inside 14 days or overdue.",
      "Shows which rule is actually being applied — Documented receipt (60 days from receipt) vs Presumed receipt (Notice + 5 days, then 60), with the regulatory citation.",
      "Inline edit for Notice Date and Documented Receipt Date directly on the panel; saving auto-recomputes the deadline and refreshes the at-risk lists.",
      "New updateCaseDates server function that updates the date fields and runs recompute in one round-trip.",
    ],
  },
  {
    date: "2026-06-21",
    title: "Zoho connection stability + mobile fixes",
    summary:
      "Resolved Zoho auth disconnecting mid-day and records not loading on mobile.",
    changes: [
      "Added a persistent (database-backed) access-token cache for Zoho so all worker isolates share one token per user, cutting refresh calls from hundreds per minute to ~1 per hour and staying well under Zoho's refresh-token rate limit.",
      "Added single-flight deduplication so concurrent requests on a cold isolate don't all kick off a token refresh simultaneously.",
      "Added access_token and access_token_expires_at columns to zoho_tokens and zoho_firm_tokens tables to back the shared cache.",
      "Fixed Clients, Leads, and Engagements pages so records load correctly on mobile viewports.",
      "Improved mobile responsiveness of the app shell (navigation, spacing, tap targets).",
      "Added this Change Log tab under Admin Settings.",
    ],
  },
];
