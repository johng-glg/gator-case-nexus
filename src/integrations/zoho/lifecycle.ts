/**
 * lifecycle.ts — SSDI Case state machine (Gator Law)
 *
 * Replaces Zoho blueprints. The transitions map is the single source of truth for valid
 * stage moves; the hooks table declares what side-effects fire when a stage is entered
 * (deadlines, tasks, e-sign, calendar). The actual I/O lives in the runner the app supplies.
 */

import { computeAppealDeadline, nextAppealTier, type AppealTier } from "./deadlines";

export type Stage =
  | "Retained"
  | "Application filed"
  | "Initial decision pending"
  | "Initial decision denied"
  | "Initial decision approved"
  | "Reconsideration filed"
  | "Recon decision pending"
  | "Recon decision denied"
  | "Recon decision approved"
  | "ALJ hearing requested"
  | "Hearing scheduled"
  | "Hearing prep"
  | "Hearing held"
  | "ALJ decision pending"
  | "ALJ decision denied"
  | "ALJ decision approved"
  | "Appeals Council requested"
  | "AC decision pending"
  | "AC decision denied"
  | "AC decision approved"
  | "Award / NOA received"
  | "Fee petition filed"
  | "Closed";

/** Valid next stages from each stage. "Closed" is reachable from anywhere (handled separately). */
export const TRANSITIONS: Record<Stage, Stage[]> = {
  "Retained": ["Application filed", "Closed"],
  "Application filed": ["Initial decision pending", "Closed"],
  "Initial decision pending": ["Initial decision denied", "Initial decision approved", "Closed"],
  "Initial decision denied": ["Reconsideration filed", "Closed"],
  "Initial decision approved": ["Award / NOA received"],
  "Reconsideration filed": ["Recon decision pending", "Closed"],
  "Recon decision pending": ["Recon decision denied", "Recon decision approved", "Closed"],
  "Recon decision denied": ["ALJ hearing requested", "Closed"],
  "Recon decision approved": ["Award / NOA received"],
  "ALJ hearing requested": ["Hearing scheduled", "Closed"],
  "Hearing scheduled": ["Hearing prep", "Closed"],
  "Hearing prep": ["Hearing held", "Closed"],
  "Hearing held": ["ALJ decision pending", "Closed"],
  "ALJ decision pending": ["ALJ decision denied", "ALJ decision approved", "Closed"],
  "ALJ decision denied": ["Appeals Council requested", "Closed"],
  "ALJ decision approved": ["Award / NOA received"],
  "Appeals Council requested": ["AC decision pending", "Closed"],
  "AC decision pending": ["AC decision denied", "AC decision approved", "Closed"],
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
  "Recon decision denied": {
    setDeadline: { tier: "ALJ Hearing", from: "noticeDate" },
    tasks: [{ label: "Request ALJ hearing", due: { type: "deadlineMinus", days: 5 } }],
    calendar: [{ label: "ALJ request deadline", on: { type: "deadlineMinus", days: 0 } }],
  },
  "Hearing scheduled": {
    tasks: [
      { label: "Begin hearing prep", due: { type: "fieldMinus", field: "ALJ_Hearing_Scheduled_Date", days: 75 } },
      { label: "Order updated medical records", due: { type: "fieldMinus", field: "ALJ_Hearing_Scheduled_Date", days: 60 } },
      { label: "Client hearing-prep session", due: { type: "fieldMinus", field: "ALJ_Hearing_Scheduled_Date", days: 14 } },
    ],
    calendar: [{ label: "ALJ hearing", on: { type: "fieldPlus", field: "ALJ_Hearing_Scheduled_Date", days: 0 } }],
  },
  "ALJ decision denied": {
    setDeadline: { tier: "Appeals Council", from: "noticeDate" },
    tasks: [{ label: "Decide on Appeals Council", due: { type: "deadlineMinus", days: 5 } }],
    calendar: [{ label: "Appeals Council deadline", on: { type: "deadlineMinus", days: 0 } }],
  },
  "AC decision denied": {
    setDeadline: { tier: "Federal Court", from: "noticeDate" },
    tasks: [{ label: "Decide on federal court complaint", due: { type: "deadlineMinus", days: 5 } }],
  },
  "Award / NOA received": {
    tasks: [{ label: "File fee petition / verify fee agreement", due: { type: "fieldPlus", field: "Notice_of_Award_Date", days: 7 } }],
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
  "Application filed":        ["SSA_Claim_Number"],
  "Initial decision denied":  ["Notice_Date"],
  "Recon decision denied":    ["Notice_Date"],
  "ALJ decision denied":      ["Notice_Date"],
  "AC decision denied":       ["Notice_Date"],
  "Hearing scheduled":        ["ALJ_Hearing_Scheduled_Date", "Hearing_Type"],
  "Award / NOA received":     ["Notice_of_Award_Date"],
};

/** Human labels for required fields — the advance dialog shows these, not raw API names. */
export const FIELD_LABELS: Record<string, string> = {
  Notice_Date: "Notice date",
  Documented_Receipt_Date: "Documented receipt date",
  ALJ_Hearing_Scheduled_Date: "Hearing date",
  Hearing_Type: "Hearing type",
  Notice_of_Award_Date: "Notice of Award date",
  SSA_Claim_Number: "SSA claim number",
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
  const legacy: Record<string,string> = { "Intake":"Retained", "Retainer signed":"Retained" };
  let v = legacy[s] ?? s;
  v = v.replace(" decision - ", " decision ");
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
 *  render these ~7 as the rail and expand only the active phase's sub-stages. No side-scroll. */
export const PHASES: { key: string; label: string; stages: Stage[] }[] = [
  { key: "intake",  label: "Intake & filing",   stages: ["Retained", "Application filed"] },
  { key: "initial", label: "Initial decision",  stages: ["Initial decision pending", "Initial decision denied", "Initial decision approved"] },
  { key: "recon",   label: "Reconsideration",   stages: ["Reconsideration filed", "Recon decision pending", "Recon decision denied", "Recon decision approved"] },
  { key: "alj",     label: "ALJ hearing",       stages: ["ALJ hearing requested", "Hearing scheduled", "Hearing prep", "Hearing held", "ALJ decision pending", "ALJ decision denied", "ALJ decision approved"] },
  { key: "ac",      label: "Appeals Council",   stages: ["Appeals Council requested", "AC decision pending", "AC decision denied", "AC decision approved"] },
  { key: "award",   label: "Award & fees",      stages: ["Award / NOA received", "Fee petition filed"] },
  { key: "closed",  label: "Closed",            stages: ["Closed"] },
];

export function phaseForStage(stage: Stage | string): string {
  return PHASES.find((p) => p.stages.includes(stage as Stage))?.key ?? "intake";
}

/** Index of the phase containing the stage (for "done / current / upcoming" styling). */
export function phaseIndex(stage: Stage | string): number {
  return Math.max(0, PHASES.findIndex((p) => p.stages.includes(stage as Stage)));
}

