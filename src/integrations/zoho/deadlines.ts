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

// ---- Federal holidays, computed for ANY year (no annual maintenance) ----
// The 11 U.S. federal holidays with the observed-shift rule (Sat → Fri before, Sun → Mon after).
// Replaces the old hardcoded 2026-2027 set so deadlines in any year roll correctly.

/** nth (1-based) `weekday` (0=Sun..6=Sat) of month0 (0=Jan), as a UTC-midnight Date. */
function nthWeekday(year: number, month0: number, weekday: number, n: number): Date {
  const first = new Date(Date.UTC(year, month0, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month0, 1 + offset + (n - 1) * 7));
}
/** last `weekday` of month0, as a UTC-midnight Date. */
function lastWeekday(year: number, month0: number, weekday: number): Date {
  const lastDay = new Date(Date.UTC(year, month0 + 1, 0));
  const offset = (lastDay.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(year, month0 + 1, 0 - offset));
}
/** Observed date for a fixed-date holiday: Sat → Fri before, Sun → Mon after. */
function observed(d: Date): Date {
  const dow = d.getUTCDay();
  if (dow === 6) return addDays(d, -1);
  if (dow === 0) return addDays(d, 1);
  return d;
}

const _holidayCache = new Map<number, ReadonlySet<string>>();
/** ISO dates federal offices are closed in `year` (observed). */
function federalHolidays(year: number): ReadonlySet<string> {
  const cached = _holidayCache.get(year);
  if (cached) return cached;
  const s = new Set<string>();
  const fixed = (m0: number, day: number) => s.add(isoDay(observed(new Date(Date.UTC(year, m0, day)))));
  fixed(0, 1);                                     // New Year's Day
  s.add(isoDay(nthWeekday(year, 0, 1, 3)));        // MLK — 3rd Mon Jan
  s.add(isoDay(nthWeekday(year, 1, 1, 3)));        // Washington's Birthday — 3rd Mon Feb
  s.add(isoDay(lastWeekday(year, 4, 1)));          // Memorial Day — last Mon May
  fixed(5, 19);                                    // Juneteenth
  fixed(6, 4);                                     // Independence Day
  s.add(isoDay(nthWeekday(year, 8, 1, 1)));        // Labor Day — 1st Mon Sep
  s.add(isoDay(nthWeekday(year, 9, 1, 2)));        // Columbus Day — 2nd Mon Oct
  fixed(10, 11);                                   // Veterans Day
  s.add(isoDay(nthWeekday(year, 10, 4, 4)));       // Thanksgiving — 4th Thu Nov
  fixed(11, 25);                                   // Christmas
  // Year boundary: next year's New Year observed on Dec 31 of THIS year (when Jan 1 next = Saturday).
  if (new Date(Date.UTC(year + 1, 0, 1)).getUTCDay() === 6) s.add(isoDay(new Date(Date.UTC(year, 11, 31))));
  _holidayCache.set(year, s);
  return s;
}

/** Is this date an observed federal holiday? */
export function isFederalHoliday(d: Date): boolean {
  return federalHolidays(d.getUTCFullYear()).has(isoDay(d));
}

/** Saturday, Sunday, or a federal holiday. */
export function isFederalNonWorkDay(d: Date): boolean {
  const day = d.getUTCDay(); // 0 = Sun, 6 = Sat
  if (day === 0 || day === 6) return true;
  return isFederalHoliday(d);
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
    case "Initial decision denied": return "Reconsideration";
    case "Recon decision denied":   return "ALJ Hearing";
    case "ALJ decision denied":     return "Appeals Council";
    case "AC decision denied":      return "Federal Court";
    default:                        return "None";
  }
}

/** Today's date in a timezone, as a UTC-midnight Date — so date-only countdowns don't drift.
 *  Use this for "today" everywhere instead of new Date() (which is the server's UTC date). */
export function localToday(timeZone = "America/Los_Angeles"): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return asUTCDate(ymd);
}
