/**
 * lifecycle.ts — SSDI Case state machine (Gator Law)
 *
 * Replaces Zoho blueprints. The transitions map is the single source of truth for valid
 * stage moves; the hooks table declares what side-effects fire when a stage is entered
 * (deadlines, tasks, e-sign, calendar, clearing a satisfied deadline). The actual I/O
 * lives in the runner the app supplies.
 *
 * 18-stage lifecycle (the 5 "decision pending" stages + "Hearing prep" were retired —
 * historical values still resolve via normalizeStage).
 */

import { computeAppealDeadline, nextAppealTier, type AppealTier } from "./deadlines";

export type Stage =
  | "Retained"
  | "Application filed"
  | "Initial decision denied"
  | "Initial decision approved"
  | "Reconsideration filed"
  | "Recon decision denied"
  | "Recon decision approved"
  | "ALJ hearing requested"
  | "Hearing scheduled"
  | "Hearing held"
  | "ALJ decision denied"
  | "ALJ decision approved"
  | "Appeals Council requested"
  | "AC decision denied"
  | "AC decision approved"
  | "Award / NOA received"
  | "Fee petition filed"
  | "Closed";

/** Valid next stages from each stage. "Closed" is reachable from anywhere (handled separately). */
export const TRANSITIONS: Record<Stage, Stage[]> = {
  "Retained": ["Application filed", "Closed"],
  "Application filed": ["Initial decision denied", "Initial decision approved", "Closed"],
  "Initial decision denied": ["Reconsideration filed", "Closed"],
  "Initial decision approved": ["Award / NOA received"],
  "Reconsideration filed": ["Recon decision denied", "Recon decision approved", "Closed"],
  "Recon decision denied": ["ALJ hearing requested", "Closed"],
  "Recon decision approved": ["Award / NOA received"],
  "ALJ hearing requested": ["Hearing scheduled", "Closed"],
  "Hearing scheduled": ["Hearing held", "Closed"],
  "Hearing held": ["ALJ decision denied", "ALJ decision approved", "Closed"],
  "ALJ decision denied": ["Appeals Council requested", "Closed"],
  "ALJ decision approved": ["Award / NOA received"],
  "Appeals Council requested": ["AC decision denied", "AC decision approved", "Closed"],
  "AC decision denied": ["Closed"],
  "AC decision approved": ["Award / NOA received"],
  "Award / NOA received": ["Fee petition filed", "Closed"],
  "Fee petition filed": ["Closed"],
  "Closed": [],
};

export function canTransition(from: Stage, to: Stage): boolean {
  return to === "Closed" || (TRANSITIONS[from] ?? []).includes(to);
}

/** Side-effects the runner should perform when a stage is ENTERED. */
export interface StageEffects {
  setDeadline?: { tier: AppealTier; from: "noticeDate" };
  /** True when entering this stage satisfies/closes any active appeal deadline
   *  (appeal filed → "file by" met; case won → no pending clock). The runner
   *  clears Active_Deadline_Type/Deadline_Date/Days_To_Deadline/Deadline_At_Risk. */
  clearDeadline?: boolean;
  tasks?: Array<{ label: string; due: DueRule }>;
  sign?: string[];
  calendar?: Array<{ label: string; on: DateRule }>;
}

/** Due/date rules resolved by the runner against case fields. */
export type DueRule =
  | { type: "deadlineMinus"; days: number }
  | { type: "fieldPlus"; field: string; days: number }
  | { type: "fieldMinus"; field: string; days: number };
export type DateRule = DueRule;

/** What fires on entering each stage. Stages not listed have no automatic effects. */
export const HOOKS: Partial<Record<Stage, StageEffects>> = {
  "Retained": {
    sign: ["SSA-1696", "SSA-827"],
    tasks: [
      { label: "Verify insured status / DLI", due: { type: "fieldPlus", field: "Date_Opened", days: 3 } },
      { label: "Confirm work / SGA status", due: { type: "fieldPlus", field: "Date_Opened", days: 3 } },
      { label: "Collect medical provider list", due: { type: "fieldPlus", field: "Date_Opened", days: 7 } },
      { label: "File SSA application", due: { type: "fieldPlus", field: "Date_Opened", days: 14 } },
    ],
  },
  "Initial decision denied": {
    setDeadline: { tier: "Reconsideration", from: "noticeDate" },
    tasks: [{ label: "File reconsideration", due: { type: "deadlineMinus", days: 5 } }],
    calendar: [{ label: "Reconsideration deadline", on: { type: "deadlineMinus", days: 0 } }],
  },
  "Initial decision approved": { clearDeadline: true },
  "Reconsideration filed": { clearDeadline: true },
  "Recon decision denied": {
    setDeadline: { tier: "ALJ Hearing", from: "noticeDate" },
    tasks: [{ label: "Request ALJ hearing", due: { type: "deadlineMinus", days: 5 } }],
    calendar: [{ label: "ALJ request deadline", on: { type: "deadlineMinus", days: 0 } }],
  },
  "Recon decision approved": { clearDeadline: true },
  "ALJ hearing requested": { clearDeadline: true },
  "Hearing scheduled": {
    tasks: [
      { label: "Begin hearing prep", due: { type: "fieldMinus", field: "ALJ_Hearing_Scheduled_Date", days: 75 } },
      { label: "Order updated medical records", due: { type: "fieldMinus", field: "ALJ_Hearing_Scheduled_Date", days: 60 } },
      { label: "Client hearing-prep session", due: { type: "fieldMinus", field: "ALJ_Hearing_Scheduled_Date", days: 14 } },
      { label: "Submit evidence + brief to OHO (5-business-day rule)", due: { type: "fieldMinus", field: "ALJ_Hearing_Scheduled_Date", days: 5 } },
    ],
    calendar: [{ label: "ALJ hearing", on: { type: "fieldPlus", field: "ALJ_Hearing_Scheduled_Date", days: 0 } }],
  },
  "Hearing held": {
    tasks: [
      { label: "Submit post-hearing evidence if record left open", due: { type: "fieldPlus", field: "Hearing_Held_Date", days: 3 } },
      { label: "Respond to VE/ME interrogatories if any", due: { type: "fieldPlus", field: "Hearing_Held_Date", days: 7 } },
    ],
  },
  "ALJ decision denied": {
    setDeadline: { tier: "Appeals Council", from: "noticeDate" },
    tasks: [{ label: "Decide on Appeals Council", due: { type: "deadlineMinus", days: 5 } }],
    calendar: [{ label: "Appeals Council deadline", on: { type: "deadlineMinus", days: 0 } }],
  },
  "ALJ decision approved": { clearDeadline: true },
  "Appeals Council requested": { clearDeadline: true },
  "AC decision denied": {
    setDeadline: { tier: "Federal Court", from: "noticeDate" },
    tasks: [{ label: "Decide on federal court complaint", due: { type: "deadlineMinus", days: 5 } }],
  },
  "AC decision approved": { clearDeadline: true },
  "Award / NOA received": {
    clearDeadline: true,
    tasks: [{ label: "File fee petition / verify fee agreement", due: { type: "fieldPlus", field: "Notice_of_Award_Date", days: 7 } }],
  },
  "Closed": {
    tasks: [
      { label: "Send final accounting / cost-reimbursement statement", due: { type: "fieldPlus", field: "Final_Disposition_Date", days: 3 } },
      { label: "Set file retention / destroy date", due: { type: "fieldPlus", field: "Final_Disposition_Date", days: 3 } },
      { label: "Revoke client portal access", due: { type: "fieldPlus", field: "Final_Disposition_Date", days: 3 } },
      { label: "Referral-source thank-you", due: { type: "fieldPlus", field: "Final_Disposition_Date", days: 3 } },
      { label: "Request review / send NPS", due: { type: "fieldPlus", field: "Final_Disposition_Date", days: 3 } },
    ],
  },
};

/** Convenience: given a stage and its notice date, the appeal deadline + tier (if any). */
export function deadlineForStage(stage: Stage, noticeDate?: string, documentedReceipt?: string | null) {
  const tier = nextAppealTier(stage);
  if (tier === "None" || !noticeDate) return { tier, deadline: null as Date | null };
  return { tier, deadline: computeAppealDeadline(noticeDate, documentedReceipt) };
}

/**
 * Data a stage REQUIRES before a case may enter it. Validated on advance so you can't move into a
 * stage without the field the workflow/engine needs (e.g. a denial without the Notice Date that the
 * appeal-deadline math depends on, or a scheduled hearing with no date). Field names are SSDI_Case
 * API names; the value may already be on the case OR supplied in the advance form.
 */
export const REQUIRED_FIELDS: Partial<Record<Stage, string[]>> = {
  "Application filed":        ["SSA_Claim_Number", "Application_Filed_Date"],
  "Initial decision denied":  ["Notice_Date"],
  "Reconsideration filed":    ["Recon_Filed_Date"],
  "Recon decision denied":    ["Notice_Date"],
  "ALJ hearing requested":    ["ALJ_Hearing_Requested_Date"],
  "Hearing scheduled":        ["ALJ_Hearing_Scheduled_Date", "Hearing_Type"],
  "Hearing held":             ["Hearing_Held_Date"],
  "ALJ decision denied":      ["Notice_Date"],
  "Appeals Council requested":["Appeals_Council_Requested_Date"],
  "AC decision denied":       ["Notice_Date"],
  "Award / NOA received":     ["Notice_of_Award_Date"],
  "Fee petition filed":       ["Fee_Petition_Filed_Date"],
};

/** Human labels for required fields — the advance dialog shows these, not raw API names. */
export const FIELD_LABELS: Record<string, string> = {
  Notice_Date: "Notice date",
  Documented_Receipt_Date: "Documented receipt date",
  ALJ_Hearing_Scheduled_Date: "Hearing date",
  Hearing_Type: "Hearing type",
  Notice_of_Award_Date: "Notice of Award date",
  SSA_Claim_Number: "SSA claim number",
  Application_Filed_Date: "Application filed date",
  Recon_Filed_Date: "Reconsideration filed date",
  ALJ_Hearing_Requested_Date: "Hearing requested date",
  Hearing_Held_Date: "Hearing held date",
  Appeals_Council_Requested_Date: "Appeals Council requested date",
  Fee_Petition_Filed_Date: "Fee petition filed date",
};

export interface MissingField { field: string; label: string; }

/** Required fields that are missing/blank for entering `to`, given the merged case+form fields. */
export function missingRequiredFields(to: Stage, fields: Record<string, unknown>): string[] {
  const isBlank = (v: unknown) => v === undefined || v === null || v === "";
  return (REQUIRED_FIELDS[to] ?? []).filter((f) => isBlank(fields[f]));
}

/** Same, but with UI labels — feed straight into the advance dialog. */
export function missingRequiredFieldsDetailed(to: Stage, fields: Record<string, unknown>): MissingField[] {
  return missingRequiredFields(to, fields).map((field) => ({ field, label: FIELD_LABELS[field] ?? field }));
}

export const CLOSURE_REASONS = ["Won","Lost","Withdrawn","Transferred","Client deceased","Conflict"] as const;
export type ClosureReason = (typeof CLOSURE_REASONS)[number];

export function normalizeStage(s: string | undefined | null): Stage {
  if (!s) return "Retained";
  // Legacy / retired stage labels — keep historical records resolvable.
  const legacy: Record<string, Stage> = {
    "Intake": "Retained",
    "Retainer signed": "Retained",
    "Initial decision pending": "Application filed",
    "Recon decision pending": "Reconsideration filed",
    "ALJ decision pending": "Hearing held",
    "AC decision pending": "Appeals Council requested",
    "Hearing prep": "Hearing scheduled",
  };
  if (legacy[s]) return legacy[s];
  const v = s.replace(" decision - ", " decision ");
  if (legacy[v]) return legacy[v];
  return v as Stage;
}

export interface DenialNextStep { nextStage: Stage; label: string; tier: string; dateField: string; }
export const DENIAL_NEXT_STEP: Partial<Record<Stage, DenialNextStep>> = {
  "Initial decision denied": { nextStage:"Reconsideration filed",    label:"File Reconsideration",   tier:"Reconsideration", dateField:"Recon_Filed_Date" },
  "Recon decision denied":   { nextStage:"ALJ hearing requested",    label:"Request ALJ hearing",    tier:"ALJ Hearing",     dateField:"ALJ_Hearing_Requested_Date" },
  "ALJ decision denied":     { nextStage:"Appeals Council requested", label:"Request Appeals Council", tier:"Appeals Council", dateField:"Appeals_Council_Requested_Date" },
  "AC decision denied":      { nextStage:"Closed",                   label:"Federal court / close",  tier:"Federal Court",   dateField:"Closed_Date" },
};

/** High-level phases for the case-detail UI. The case sits in exactly one phase at a time;
 *  render these ~7 as the rail. Sub-stages are collapsed by default and toggle per-phase. */
export const PHASES: { key: string; label: string; stages: Stage[] }[] = [
  { key: "intake",  label: "Intake & filing",   stages: ["Retained", "Application filed"] },
  { key: "initial", label: "Initial decision",  stages: ["Initial decision denied", "Initial decision approved"] },
  { key: "recon",   label: "Reconsideration",   stages: ["Reconsideration filed", "Recon decision denied", "Recon decision approved"] },
  { key: "alj",     label: "ALJ hearing",       stages: ["ALJ hearing requested", "Hearing scheduled", "Hearing held", "ALJ decision denied", "ALJ decision approved"] },
  { key: "ac",      label: "Appeals Council",   stages: ["Appeals Council requested", "AC decision denied", "AC decision approved"] },
  { key: "award",   label: "Award & fees",      stages: ["Award / NOA received", "Fee petition filed"] },
  { key: "closed",  label: "Closed",            stages: ["Closed"] },
];

export function phaseForStage(stage: Stage | string): string {
  const s = normalizeStage(stage as string);
  return PHASES.find((p) => p.stages.includes(s))?.key ?? "intake";
}

/** Index of the phase containing the stage (for "done / current / upcoming" styling). */
export function phaseIndex(stage: Stage | string): number {
  const s = normalizeStage(stage as string);
  return Math.max(0, PHASES.findIndex((p) => p.stages.includes(s)));
}

/**
 * Stalled-claim SLA — how many days a case should normally remain in a given stage before
 * staff intervention is expected. Used by the nightly sweep to surface "stalled" cases
 * (in-stage longer than the SLA with no stage advance recorded). Tunable.
 *
 * Stages omitted from this map have NO SLA (e.g. "Closed", terminal decision-approved
 * stages that immediately transition to Award / NOA).
 */
export const STAGE_SLA_DAYS: Partial<Record<Stage, number>> = {
  "Retained": 30,                       // file SSA application
  "Application filed": 180,             // SSA initial decision window
  "Initial decision denied": 45,        // file reconsideration
  "Reconsideration filed": 180,         // SSA recon decision window
  "Recon decision denied": 45,          // request ALJ hearing
  "ALJ hearing requested": 540,         // 12-18mo OHO backlog; flag past 18mo
  "Hearing scheduled": 120,             // hearing typically within ~120d of scheduling
  "Hearing held": 90,                   // ALJ decision typically issued in 60-90d
  "ALJ decision denied": 45,            // Appeals Council decision window
  "Appeals Council requested": 365,     // AC backlog
  "AC decision denied": 45,             // federal court decision window
  "Award / NOA received": 30,           // file fee petition
  "Fee petition filed": 60,             // OHO fee approval
};
