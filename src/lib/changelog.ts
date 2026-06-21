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
