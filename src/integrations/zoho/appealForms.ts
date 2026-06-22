/**
 * appealForms.ts — appeal-filing form generators (Gator SSDI).
 *
 * Unlike SSA-1696/827 (collect the client's signature), these are pre-filled from case data into a
 * PDF the rep reviews and files in ERE. This engine owns: which form(s) a denial triggers, each
 * form's spec (signer, official URL, merge fields), and the case→form field mapping. The Zoho Writer
 * merge + PDF render + (optional) claimant e-sign live in the service the app supplies.
 */

export type AppealForm = "SSA-561" | "SSA-3441" | "HA-501" | "HA-520";

export interface AppealFormSpec {
  code: AppealForm;
  label: string;
  url: string;
  tier: "Reconsideration" | "ALJ Hearing" | "Appeals Council";
  signer: "Claimant" | "Representative" | "Both";
  fields: string[]; // merge tags the template expects
}

const COMMON = ["Claimant_Full_Name", "SSN", "SSA_Claim_Number", "Today_Date"];

export const APPEAL_FORMS: Record<AppealForm, AppealFormSpec> = {
  "SSA-561": { code: "SSA-561", label: "SSA-561 — Request for Reconsideration", url: "https://www.ssa.gov/forms/ssa-561.pdf",
    tier: "Reconsideration", signer: "Claimant", fields: [...COMMON, "Prior_Decision_Date", "Reason_For_Appeal"] },
  "SSA-3441": { code: "SSA-3441", label: "SSA-3441 — Disability Report (Appeal)", url: "https://www.ssa.gov/forms/ssa-3441.pdf",
    tier: "Reconsideration", signer: "Claimant", fields: [...COMMON, "Changes_Since_Last_Report", "New_Conditions", "New_Treatment"] },
  "HA-501": { code: "HA-501", label: "HA-501 — Request for Hearing by ALJ", url: "https://www.ssa.gov/forms/ha-501.pdf",
    tier: "ALJ Hearing", signer: "Both", fields: [...COMMON, "Recon_Denial_Date", "Disagreement_Reason"] },
  "HA-520": { code: "HA-520", label: "HA-520 — Request for Review of Hearing Decision/Order", url: "https://www.ssa.gov/forms/ha-520.pdf",
    tier: "Appeals Council", signer: "Both", fields: [...COMMON, "ALJ_Decision_Date", "Grounds_For_Review"] },
};

/** Which appeal forms a denial stage triggers (de-dashed stage names). */
export function appealFormsForStage(stage: string): AppealForm[] {
  switch (stage) {
    case "Initial decision denied": return ["SSA-561", "SSA-3441"];
    case "Recon decision denied":   return ["HA-501"];
    case "ALJ decision denied":     return ["HA-520"];
    default:                        return [];
  }
}

export interface MergeContext {
  clientFullName: string; ssn?: string; claimNumber?: string; today: string;
  priorDecisionDate?: string; reconDenialDate?: string; aljDecisionDate?: string;
  extra?: Record<string, string>; // form-specific free text the rep fills (reasons, grounds, etc.)
}

/** Map case/client data → the form's merge tags. Returns only known, non-empty values. */
export function mergeFieldsForForm(form: AppealForm, ctx: MergeContext): Record<string, string> {
  const base: Record<string, string | undefined> = {
    Claimant_Full_Name: ctx.clientFullName, SSN: ctx.ssn, SSA_Claim_Number: ctx.claimNumber, Today_Date: ctx.today,
    Prior_Decision_Date: ctx.priorDecisionDate, Recon_Denial_Date: ctx.reconDenialDate, ALJ_Decision_Date: ctx.aljDecisionDate,
    ...(ctx.extra ?? {}),
  };
  const want = new Set(APPEAL_FORMS[form].fields);
  return Object.fromEntries(
    Object.entries(base).filter(([k, v]) => want.has(k) && v !== undefined && v !== "") as [string, string][],
  );
}
