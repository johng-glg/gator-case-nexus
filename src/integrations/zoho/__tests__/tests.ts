// @ts-nocheck
/* Run: npx --yes tsx tests.ts   (from this folder) */
import { computeAppealDeadline, isFederalNonWorkDay, asUTCDate, releaseExpiration, daysUntil } from "../deadlines";
import { ssdiProjectedFee, ssdiUserFee, ssdiNetFee, tcpaFee, harassmentFee } from "../fees";
import { canTransition, deadlineForStage, missingRequiredFields } from "../lifecycle";

let pass = 0, fail = 0;
const iso = (d: Date) => d.toISOString().slice(0, 10);
function eq(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "✓" : "✗"} ${label}  got=${JSON.stringify(got)}${ok ? "" : ` want=${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
}

// ---- deadline math ----
eq("clean weekday: notice 2026-06-01 → 2026-08-05", iso(computeAppealDeadline("2026-06-01")), "2026-08-05");
eq("lands on Juneteenth (Fri) → rolls to Mon 2026-06-22", iso(computeAppealDeadline("2026-04-15")), "2026-06-22");
eq("documented receipt later than notice+5 pushes deadline out",
   iso(computeAppealDeadline("2026-06-01", "2026-06-15")), "2026-08-14");
// property: a computed deadline is never a weekend/holiday
const sample = ["2026-06-01", "2026-04-15", "2026-05-21", "2026-12-20", "2027-04-20"];
eq("no computed deadline is a non-work day",
   sample.every(n => !isFederalNonWorkDay(computeAppealDeadline(n))), true);
// +5 is NOT rolled even if it lands on a weekend (only final endpoint rolls)
eq("release expires +1yr", iso(releaseExpiration("2026-03-10")), "2027-03-10");

// ---- fees ----
eq("SSDI cap binds at high back pay", ssdiProjectedFee(40000), 9200);
eq("SSDI 25% below cap", ssdiProjectedFee(20000), 5000);
eq("user fee: $123 cap binds on $9,200 fee", ssdiUserFee(9200), 123);
eq("user fee: 6.3% when fee small", Number(ssdiUserFee(1000).toFixed(2)), 63);
eq("SSDI net = fee − user fee", ssdiNetFee(40000), 9077);
eq("TCPA tier 1 only (500k)", Number(tcpaFee(500_000).toFixed(2)), 166666.67);
eq("TCPA into tier 2 (1.5M)", Number(tcpaFee(1_500_000).toFixed(2)), 483333.33);
eq("TCPA into tier 3 (3M)", Number(tcpaFee(3_000_000).toFixed(2)), 833333.33);
eq("FCRA greater-of (50%-after-costs wins)", harassmentFee({ settlement: 10000, costs: 2000, feeShiftingAward: 3000 }), 4000);
eq("FCRA greater-of (fee-shift wins)", harassmentFee({ settlement: 5000, costs: 1000, feeShiftingAward: 6000 }), 6000);

// ---- lifecycle ----
eq("valid transition Retained→Application filed", canTransition("Retained", "Application filed"), true);
eq("invalid transition Retained→Hearing held", canTransition("Retained", "Hearing held"), false);
eq("can close from anywhere", canTransition("Hearing prep", "Closed"), true);
eq("denied-initial sets Reconsideration tier",
   deadlineForStage("Initial decision denied", "2026-06-01").tier, "Reconsideration");
eq("approved has no appeal tier", deadlineForStage("Initial decision approved").tier, "None");

// ---- stage-gate validation ----
eq("denial needs Notice_Date", missingRequiredFields("Initial decision denied", {}).includes("Notice_Date"), true);
eq("denial satisfied with Notice_Date", missingRequiredFields("Initial decision denied", { Notice_Date: "2026-06-01" }).length, 0);
eq("hearing needs date + type", missingRequiredFields("Hearing scheduled", {}).length, 2);
eq("stage with no requirements is clear", missingRequiredFields("Reconsideration filed", {}).length, 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
