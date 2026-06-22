/**
 * Medical Records Requests — lifecycle engine.
 * Pure functions: no Zoho I/O, no DB. Tested in __tests__/medicalRecords.test.ts.
 */

export const REQUEST_STATUSES = [
  "Not started",
  "Requested",
  "Followed up",
  "Received",
  "Unable to obtain",
  "Cancelled",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export interface RecordsRequest {
  id?: string;
  Request_Status: RequestStatus;
  Requested_Date?: string | null;
  Last_Followup_Date?: string | null;
  Followup_Count?: number | null;
  Received_Date?: string | null;
  Pages_Received?: number | null;
  Fee_Paid_Date?: string | null;
  Fee_Amount?: number | null;
  Provider_Name?: string | null;
  SSDI_Case?: string | null;
}

const MS_PER_DAY = 86_400_000;
const FOLLOWUP_INTERVAL_DAYS = 14;
const MAX_FOLLOWUPS = 3;
const STALE_DAYS = 45;

const OPEN: ReadonlySet<RequestStatus> = new Set(["Requested", "Followed up"]);
const TERMINAL: ReadonlySet<RequestStatus> = new Set([
  "Received",
  "Unable to obtain",
  "Cancelled",
]);

export function asUTCDate(d: Date | string): Date {
  if (typeof d === "string") {
    const t = d.length <= 10 ? `${d}T00:00:00Z` : d;
    return new Date(t);
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_DAY);
}

/** Days between Requested_Date and `today` (open requests). */
export function agingDays(r: Pick<RecordsRequest, "Request_Status" | "Requested_Date">, today: Date = new Date()): number {
  if (!r.Requested_Date) return 0;
  const t = asUTCDate(today).getTime();
  const req = asUTCDate(r.Requested_Date).getTime();
  return Math.max(0, Math.floor((t - req) / MS_PER_DAY));
}

/** Stale = open AND (>= 45 days aging OR follow-ups exhausted). */
export function isStale(
  r: Pick<RecordsRequest, "Request_Status" | "Requested_Date" | "Followup_Count">,
  today: Date = new Date(),
): boolean {
  if (!OPEN.has(r.Request_Status)) return false;
  if ((r.Followup_Count ?? 0) >= MAX_FOLLOWUPS) return true;
  return agingDays(r, today) >= STALE_DAYS;
}

/**
 * Next follow-up date as YYYY-MM-DD, or null if no follow-up is owed.
 * Cadence: every 14 days from Requested_Date (first) or Last_Followup_Date.
 * Stops at 3 follow-ups (escalate by hand).
 */
export function nextFollowupDate(
  r: Pick<RecordsRequest, "Request_Status" | "Requested_Date" | "Last_Followup_Date" | "Followup_Count">,
): string | null {
  if (!OPEN.has(r.Request_Status)) return null;
  if ((r.Followup_Count ?? 0) >= MAX_FOLLOWUPS) return null;
  const anchor = r.Last_Followup_Date ?? r.Requested_Date;
  if (!anchor) return null;
  return iso(addDays(asUTCDate(anchor), FOLLOWUP_INTERVAL_DAYS));
}

/** Open requests whose nextFollowupDate is on or before `today`. */
export function requestsNeedingFollowup<T extends RecordsRequest>(rs: readonly T[], today: Date = new Date()): T[] {
  const t = asUTCDate(today).getTime();
  return rs.filter((r) => {
    const d = nextFollowupDate(r);
    return d !== null && asUTCDate(d).getTime() <= t;
  });
}

/** Sweep-side helper: returns only the requests for which a Task should be created. NEVER mutates Followup_Count. */
export function followupSweepUpdates<T extends RecordsRequest>(rs: readonly T[], today: Date = new Date()): T[] {
  return requestsNeedingFollowup(rs, today);
}

export const TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  "Not started": ["Requested", "Cancelled"],
  "Requested": ["Followed up", "Received", "Unable to obtain", "Cancelled"],
  "Followed up": ["Followed up", "Received", "Unable to obtain", "Cancelled"],
  "Received": [],
  "Unable to obtain": [],
  "Cancelled": [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** Field updates when a follow-up is logged: bump count, stamp date, set status. */
export function applyFollowup(r: Pick<RecordsRequest, "Followup_Count">, today: Date = new Date()): Partial<RecordsRequest> {
  return {
    Request_Status: "Followed up",
    Last_Followup_Date: iso(asUTCDate(today)),
    Followup_Count: (r.Followup_Count ?? 0) + 1,
  };
}

export function isTerminal(s: RequestStatus): boolean {
  return TERMINAL.has(s);
}

export function isOpen(s: RequestStatus): boolean {
  return OPEN.has(s);
}
