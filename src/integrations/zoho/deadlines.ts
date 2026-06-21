/**
 * deadlines.ts — SSA appeal-deadline engine (Gator Law SSDI)
 *
 * The piece Zoho formulas CAN'T do: date math with weekend/federal-holiday rollover.
 *
 * Rule (verified against eCFR, current 2026):
 *   deadline = noticeDate + 5 (presumed receipt, 20 CFR 404.901)  ← start of clock
 *                        + 60 (appeal window, 404.909/.933/.968, 422.210)
 *            = noticeDate + 65, THEN roll forward off weekends/federal holidays (404.3(b)).
 *   The +5 is the START of the 60-day clock, not an add-on, and is NOT itself rolled.
 *   "Receipt" is rebuttable: if a documented later receipt date is supplied, the 60-day
 *   clock runs from that date instead (no +5).
 *
 * All dates handled in UTC to avoid timezone drift. Pass/return Date objects at UTC midnight.
 */

/** Federal holidays — DATES FEDERAL OFFICES ARE CLOSED (observed). MAINTAIN ANNUALLY. */
const FEDERAL_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19",
  "2026-07-03", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-05-31", "2027-06-18",
  "2027-07-05", "2027-09-06", "2027-10-11", "2027-11-11", "2027-11-25", "2027-12-24", "2027-12-31",
]);

const DAY_MS = 86_400_000;

/** Build a UTC-midnight Date from a Y-M-D string or Date. */
export function asUTCDate(d: Date | string): Date {
  if (typeof d === "string") {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day));
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/** Saturday, Sunday, or a federal holiday. */
export function isFederalNonWorkDay(d: Date): boolean {
  const day = d.getUTCDay(); // 0 = Sun, 6 = Sat
  if (day === 0 || day === 6) return true;
  return FEDERAL_HOLIDAYS.has(isoDay(d));
}

/** 20 CFR 404.3(b): if the last day is a non-work day, roll to the next working day. */
export function rollForward(d: Date): Date {
  let r = asUTCDate(d);
  while (isFederalNonWorkDay(r)) r = addDays(r, 1);
  return r;
}

/**
 * Compute an SSA appeal deadline.
 * @param noticeDate        date printed on the adverse notice
 * @param documentedReceipt optional PROVEN actual-receipt date (rebuts the +5 presumption)
 */
export function computeAppealDeadline(
  noticeDate: Date | string,
  documentedReceipt?: Date | string | null,
): Date {
  const start = documentedReceipt ? asUTCDate(documentedReceipt) : addDays(asUTCDate(noticeDate), 5);
  const raw = addDays(start, 60);
  return rollForward(raw); // only the final endpoint rolls
}

/** Whole days from today (UTC) until the deadline. Negative = past due. */
export function daysUntil(deadline: Date | string, today: Date = new Date()): number {
  const t = asUTCDate(today);
  const d = asUTCDate(deadline);
  return Math.round((d.getTime() - t.getTime()) / DAY_MS);
}

/** At risk when the deadline is within `thresholdDays` (default 14) and not past. */
export function isAtRisk(deadline: Date | string, thresholdDays = 14, today: Date = new Date()): boolean {
  const n = daysUntil(deadline, today);
  return n >= 0 && n <= thresholdDays;
}

/** HIPAA / SSA-827 release expires one year after signing. */
export function releaseExpiration(signedDate: Date | string): Date {
  const s = asUTCDate(signedDate);
  return new Date(Date.UTC(s.getUTCFullYear() + 1, s.getUTCMonth(), s.getUTCDate()));
}

/** Release expiring soon (default within 30 days). */
export function releaseExpiringSoon(signedDate: Date | string, withinDays = 30, today: Date = new Date()): boolean {
  const n = daysUntil(releaseExpiration(signedDate), today);
  return n >= 0 && n <= withinDays;
}

/** Which appeal window follows a given adverse outcome (drives Active Deadline Type). */
export type AppealTier = "Reconsideration" | "ALJ Hearing" | "Appeals Council" | "Federal Court" | "None";

export function nextAppealTier(stage: string): AppealTier {
  switch (stage) {
    case "Initial decision - denied": return "Reconsideration";
    case "Recon decision - denied":   return "ALJ Hearing";
    case "ALJ decision - denied":     return "Appeals Council";
    case "AC decision - denied":      return "Federal Court";
    default:                          return "None";
  }
}
