/**
 * leadScreening.ts — SSDI lead qualification + scoring (Gator).
 *
 * Turns a structured intake screener into a decision: knockouts (auto-decline / caution), a tier
 * (Decline / Strong / Marginal / Needs review), a 0-100 score, and an urgency flag from any appeal
 * deadline. Pure + tested — the screener UI and Zoho writes live in the app.
 *
 * The SSDI realities encoded here:
 *  - Doing SGA (earning over the monthly limit) is a near-automatic disability denial → hard knockout.
 *  - No medical treatment makes disability very hard to prove → strong caution.
 *  - The impairment must be expected to last ≥12 months (or be terminal) → hard knockout if not.
 *  - For DIB, an expired Date Last Insured bars Title II → caution (consider SSI instead).
 *  - Already represented → caution (conflict / ethics).
 *  - Older claimants get favorable medical-vocational "grid" rules → score boost.
 *
 * SGA limits are config (verify annually): 2026 = $1,690 non-blind / $2,830 blind.
 */
import { asUTCDate, daysUntil } from "./deadlines";

export const SGA_2026 = { NON_BLIND: 1690, BLIND: 2830 } as const;

export type ClaimType = "DIB" | "SSI" | "Concurrent" | "Unknown";
export type LeadLevel =
  | "No application yet" | "Initial pending" | "Initial denied"
  | "Recon denied" | "ALJ denied" | "Other";
export type LeadTier = "Decline" | "Strong" | "Marginal" | "Needs review";

export interface ScreenerInput {
  workingAboveSGA?: boolean;
  monthlyEarnings?: number;
  isBlind?: boolean;
  receivingTreatment?: boolean;
  meetsTwelveMonthDuration?: boolean;
  claimType?: ClaimType;
  dateLastInsured?: string;
  alreadyRepresented?: boolean;
  age?: number;
  currentLevel?: LeadLevel;
  appealDeadlineDate?: string;
}

export interface Knockout { code: string; label: string; severity: "decline" | "caution"; }
export interface ScreenResult {
  tier: LeadTier;
  score: number;
  knockouts: Knockout[];
  urgent: boolean;
  reasons: string[];
}

const CRITICAL: (keyof ScreenerInput)[] = ["workingAboveSGA", "receivingTreatment", "meetsTwelveMonthDuration"];

/** True if monthly earnings exceed the SGA limit for the claimant. */
export function sgaExceeded(monthlyEarnings: number, isBlind = false, cfg = SGA_2026): boolean {
  return monthlyEarnings > (isBlind ? cfg.BLIND : cfg.NON_BLIND);
}

export function screenLead(
  input: ScreenerInput,
  opts?: { today?: Date; sga?: typeof SGA_2026; urgentWithinDays?: number },
): ScreenResult {
  const today = opts?.today ?? new Date();
  const sga = opts?.sga ?? SGA_2026;
  const urgentWithin = opts?.urgentWithinDays ?? 21;

  const aboveSGA = input.workingAboveSGA ??
    (typeof input.monthlyEarnings === "number" ? sgaExceeded(input.monthlyEarnings, input.isBlind, sga) : undefined);

  const knockouts: Knockout[] = [];
  const K = (code: string, label: string, severity: "decline" | "caution") =>
    knockouts.push({ code, label, severity });

  if (aboveSGA === true) K("above_sga", "Working above SGA — disability cannot be established", "decline");
  if (input.meetsTwelveMonthDuration === false) K("duration_under_12mo", "Impairment not expected to last 12 months", "decline");
  if (input.receivingTreatment === false) K("no_treatment", "No current medical treatment — hard to prove disability", "caution");
  if ((input.claimType === "DIB" || input.claimType === "Concurrent") && input.dateLastInsured &&
      asUTCDate(input.dateLastInsured).getTime() < asUTCDate(today).getTime()) {
    K("dli_expired", "Date Last Insured has passed — Title II (DIB) may be barred; consider SSI", "caution");
  }
  if (input.alreadyRepresented === true) K("already_represented", "Claimant already has a representative", "caution");

  const dl = input.appealDeadlineDate ? daysUntil(input.appealDeadlineDate, today) : null;
  const urgent = dl !== null && dl >= 0 && dl <= urgentWithin;

  if (knockouts.some((k) => k.severity === "decline")) {
    return { tier: "Decline", score: 0, knockouts, urgent, reasons: ["Hard knockout present"] };
  }

  const missing = CRITICAL.filter((f) => input[f] === undefined && !(f === "workingAboveSGA" && aboveSGA !== undefined));
  if (missing.length) {
    return { tier: "Needs review", score: 0, knockouts, urgent, reasons: [`Missing: ${missing.join(", ")}`] };
  }

  let score = 50; const reasons: string[] = ["viable: passes screening"];
  if (input.receivingTreatment === false) { score -= 25; reasons.push("-no current treatment"); }
  if (typeof input.age === "number") {
    if (input.age >= 55) { score += 25; reasons.push("+age ≥55 (grid)"); }
    else if (input.age >= 50) { score += 15; reasons.push("+age 50-54 (grid)"); }
  }
  if (input.currentLevel === "Recon denied" || input.currentLevel === "ALJ denied") {
    score += 10; reasons.push("+developed record");
  }
  if (knockouts.some((k) => k.code === "dli_expired")) { score -= 15; reasons.push("-DLI expired"); }
  if (input.alreadyRepresented) { score -= 15; reasons.push("-already represented"); }
  score = Math.max(0, Math.min(100, score));

  const tier: LeadTier = score >= 70 ? "Strong" : "Marginal";
  return { tier, score, knockouts, urgent, reasons };
}
