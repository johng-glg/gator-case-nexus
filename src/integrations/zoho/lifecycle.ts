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
  | "Initial decision - pending"
  | "Initial decision - denied"
  | "Initial decision - approved"
  | "Reconsideration filed"
  | "Recon decision - pending"
  | "Recon decision - denied"
  | "Recon decision - approved"
  | "ALJ hearing requested"
  | "Hearing scheduled"
  | "Hearing prep"
  | "Hearing held"
  | "ALJ decision - pending"
  | "ALJ decision - denied"
  | "ALJ decision - approved"
  | "Appeals Council requested"
  | "AC decision - pending"
  | "AC decision - denied"
  | "AC decision - approved"
  | "Award / NOA received"
  | "Fee petition filed"
  | "Closed";

/**
 * Legacy stages still present in Zoho data. Map to current Stage so the UI / state machine
 * keep working for cases opened before the Intake + Retainer-signed collapse.
 */
const LEGACY_STAGE_MAP: Record<string, Stage> = {
  "Intake": "Retained",
  "Retainer signed": "Retained",
};

export function normalizeStage(raw: string | null | undefined): Stage {
  if (!raw) return "Retained";
  return (LEGACY_STAGE_MAP[raw] ?? raw) as Stage;
}

/** Valid next stages from each stage. "Closed" is reachable from anywhere (handled separately). */
export const TRANSITIONS: Record<Stage, Stage[]> = {
  "Retained": ["Application filed", "Closed"],
  "Application filed": ["Initial decision - pending", "Closed"],
  "Initial decision - pending": ["Initial decision - denied", "Initial decision - approved", "Closed"],
  "Initial decision - denied": ["Reconsideration filed", "Closed"],
  "Initial decision - approved": ["Award / NOA received"],
  "Reconsideration filed": ["Recon decision - pending", "Closed"],
  "Recon decision - pending": ["Recon decision - denied", "Recon decision - approved", "Closed"],
  "Recon decision - denied": ["ALJ hearing requested", "Closed"],
  "Recon decision - approved": ["Award / NOA received"],
  "ALJ hearing requested": ["Hearing scheduled", "Closed"],
  "Hearing scheduled": ["Hearing prep", "Closed"],
  "Hearing prep": ["Hearing held", "Closed"],
  "Hearing held": ["ALJ decision - pending", "Closed"],
  "ALJ decision - pending": ["ALJ decision - denied", "ALJ decision - approved", "Closed"],
  "ALJ decision - denied": ["Appeals Council requested", "Closed"],
  "ALJ decision - approved": ["Award / NOA received"],
  "Appeals Council requested": ["AC decision - pending", "Closed"],
  "AC decision - pending": ["AC decision - denied", "AC decision - approved", "Closed"],
  "AC decision - denied": ["Closed"],
  "AC decision - approved": ["Award / NOA received"],
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
    sign: ["SSA-1696", "SSA-827", "Retainer"],
    tasks: [{ label: "File SSA application", due: { type: "fieldPlus", field: "Date_Opened", days: 14 } }],
  },
  "Initial decision - denied": {
    setDeadline: { tier: "Reconsideration", from: "noticeDate" },
    tasks: [{ label: "File reconsideration", due: { type: "deadlineMinus", days: 5 } }],
    calendar: [{ label: "Reconsideration deadline", on: { type: "deadlineMinus", days: 0 } }],
  },
  "Recon decision - denied": {
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
  "ALJ decision - denied": {
    setDeadline: { tier: "Appeals Council", from: "noticeDate" },
    tasks: [{ label: "Decide on Appeals Council", due: { type: "deadlineMinus", days: 5 } }],
    calendar: [{ label: "Appeals Council deadline", on: { type: "deadlineMinus", days: 0 } }],
  },
  "AC decision - denied": {
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

/** Denial stages auto-suggest the next-tier filing stage + which date field to prefill. */
export const DENIAL_NEXT_STEP: Partial<Record<Stage, { nextStage: Stage; dateField: string; label: string }>> = {
  "Initial decision - denied": { nextStage: "Reconsideration filed", dateField: "Recon_Filed_Date", label: "File reconsideration" },
  "Recon decision - denied":   { nextStage: "ALJ hearing requested", dateField: "ALJ_Hearing_Requested_Date", label: "Request ALJ hearing" },
  "ALJ decision - denied":     { nextStage: "Appeals Council requested", dateField: "Appeals_Council_Requested_Date", label: "Request Appeals Council review" },
  // AC denial → federal court complaint, handled outside the SSDI lifecycle.
};

/** Closure reason picklist for stage Closed. */
export const CLOSURE_REASONS = ["Won", "Lost", "Withdrawn", "Transferred", "Client deceased", "Conflict"] as const;
export type ClosureReason = typeof CLOSURE_REASONS[number];

/** 7-phase grouping for the lifecycle UI. Every Stage appears in exactly one phase. */
export interface Phase {
  key: string;
  label: string;
  stages: Stage[];
}

export const PHASES: Phase[] = [
  { key: "intake", label: "Intake & filing", stages: ["Retained", "Application filed"] },
  { key: "initial", label: "Initial decision", stages: ["Initial decision - pending", "Initial decision - denied", "Initial decision - approved"] },
  { key: "recon", label: "Reconsideration", stages: ["Reconsideration filed", "Recon decision - pending", "Recon decision - denied", "Recon decision - approved"] },
  { key: "alj", label: "ALJ hearing", stages: ["ALJ hearing requested", "Hearing scheduled", "Hearing prep", "Hearing held", "ALJ decision - pending", "ALJ decision - denied", "ALJ decision - approved"] },
  { key: "ac", label: "Appeals Council", stages: ["Appeals Council requested", "AC decision - pending", "AC decision - denied", "AC decision - approved"] },
  { key: "award", label: "Award & fees", stages: ["Award / NOA received", "Fee petition filed"] },
  { key: "closed", label: "Closed", stages: ["Closed"] },
];

export function phaseForStage(stage: Stage): Phase | undefined {
  return PHASES.find((p) => (p.stages as readonly string[]).includes(stage));
}

export function phaseIndex(stage: Stage | string): number {
  return PHASES.findIndex((p) => (p.stages as readonly string[]).includes(stage));
}
