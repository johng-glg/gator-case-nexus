/**
 * fees.ts — fee engine (Gator Law)
 *
 * NOTE: For SSDI, Projected Fee and User Fee Withheld are computed as native Zoho FORMULA
 * fields on the SSDI Case (Min(BackPay*0.25, 9200) and Min(123, ProjectedFee*0.063)).
 * This module mirrors that math for app-side display/reconciliation, and provides the
 * OTHER fee shapes (FCRA/FDCPA greater-of, TCPA tiered) for when those practices come online.
 *
 * Three rule shapes total:
 *   1. SSDI       — flat cap: lesser of 25% of past-due or $9,200 (static; SSA rescinded COLA May 2025)
 *   2. FCRA/FDCPA — greater of 50%-after-costs OR fee-shifting (court-awarded) attorney's fees
 *   3. TCPA       — tiered contingency on gross: 33.33% to $1M, 30% $1–2M, 20% over $2M
 */

export const SSDI_FEE = { CAP: 9200, USER_FEE_FLAT: 123, USER_FEE_PCT: 0.063 } as const;

/** SSDI authorized fee (fee-agreement process): lesser of 25% of back pay or the cap. */
export function ssdiProjectedFee(backPay: number, cfg = SSDI_FEE): number {
  return Math.min(0.25 * backPay, cfg.CAP);
}

/** SSA assessment withheld from the rep's payment (NOT chargeable to client). */
export function ssdiUserFee(authorizedFee: number, cfg = SSDI_FEE): number {
  return Math.min(cfg.USER_FEE_FLAT, cfg.USER_FEE_PCT * authorizedFee);
}

/** What actually lands in the firm's account from an SSDI win, before case costs. */
export function ssdiNetFee(backPay: number): number {
  const fee = ssdiProjectedFee(backPay);
  return fee - ssdiUserFee(fee);
}

/** FCRA / FDCPA: greater of (50% of settlement after costs) or the fee-shifting award. */
export function harassmentFee(args: {
  settlement: number;
  costs: number;
  feeShiftingAward: number;
}): number {
  const fiftyAfterCosts = 0.5 * Math.max(0, args.settlement - args.costs);
  return Math.max(fiftyAfterCosts, args.feeShiftingAward);
}

/** TCPA: tiered contingency on GROSS recovery. Costs reimbursed separately. */
export function tcpaFee(gross: number): number {
  const T1 = 1_000_000, T2 = 2_000_000;
  let fee = 0;
  fee += Math.min(gross, T1) * (1 / 3);
  if (gross > T1) fee += (Math.min(gross, T2) - T1) * 0.30;
  if (gross > T2) fee += (gross - T2) * 0.20;
  return fee;
}

/** Guardian referral fee per claim/case (from attorney's fees). */
export const REFERRAL_FEE = 500;
