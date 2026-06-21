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
