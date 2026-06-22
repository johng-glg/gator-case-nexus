/**
 * documents.ts — canonical per-phase SSA/OHO document checklist (Gator SSDI).
 *
 * Single source of truth for "what documents are needed at each phase" — replaces the hardcoded,
 * localStorage-only list in the UI. The app reads this for the checklist and stores each doc's
 * STATUS per case in a table (see lovable-document-checklist-prompt.md), so status is durable and
 * firm-wide instead of per-browser.
 *
 * `phase` keys match PHASES in lifecycle.ts (intake/initial/recon/alj/ac/award/closed).
 */

import { PHASES, phaseIndex, type Stage } from "./lifecycle";

export type DocStatus = "To do" | "Sent" | "Received" | "Filed";
export const DOC_STATUSES: readonly DocStatus[] = ["To do", "Sent", "Received", "Filed"];

export interface ChecklistDoc {
  code: string;        // stable id for persistence (never change once shipped)
  label: string;
  phase: string;       // PHASES key
  url?: string;        // official SSA/OHO form link, where one exists
  required?: boolean;  // required vs optional/nice-to-have
}

/** The checklist. Add/extend here — the UI follows automatically. */
export const DOCUMENT_CHECKLIST: ChecklistDoc[] = [
  // Intake & filing
  { code: "SSA-1696", label: "SSA-1696 — Appointment of Representative", phase: "intake", required: true, url: "https://www.ssa.gov/forms/ssa-1696.pdf" },
  { code: "SSA-827",  label: "SSA-827 — Authorization to Disclose Information", phase: "intake", required: true, url: "https://www.ssa.gov/forms/ssa-827.pdf" },
  { code: "SSA-1693", label: "SSA-1693 — Fee Agreement", phase: "intake", required: false, url: "https://www.ssa.gov/forms/ssa-1693.pdf" },
  { code: "retainer", label: "Gator retainer agreement", phase: "intake", required: true },

  // Reconsideration
  { code: "SSA-561",  label: "SSA-561 — Request for Reconsideration", phase: "recon", required: true, url: "https://www.ssa.gov/forms/ssa-561.pdf" },
  { code: "SSA-3441", label: "SSA-3441 — Disability Report - Appeal", phase: "recon", required: true, url: "https://www.ssa.gov/forms/ssa-3441.pdf" },

  // ALJ hearing
  { code: "HA-501",            label: "HA-501 — Request for Hearing by ALJ", phase: "alj", required: true, url: "https://www.ssa.gov/forms/ha-501.pdf" },
  { code: "pre-hearing-brief", label: "Pre-hearing brief", phase: "alj", required: false },

  // Appeals Council
  { code: "HA-520",   label: "HA-520 — Request for Review of Hearing Decision/Order", phase: "ac", required: true, url: "https://www.ssa.gov/forms/ha-520.pdf" },
  { code: "ac-brief", label: "Appeals Council brief", phase: "ac", required: false },

  // Award & fees
  { code: "fee-petition", label: "Fee petition / fee agreement verification", phase: "award", required: false },
];

/** Docs for a single phase. */
export function documentsForPhase(phaseKey: string): ChecklistDoc[] {
  return DOCUMENT_CHECKLIST.filter((d) => d.phase === phaseKey);
}

/** Look up a doc by its stable code. */
export function documentByCode(code: string): ChecklistDoc | undefined {
  return DOCUMENT_CHECKLIST.find((d) => d.code === code);
}

/**
 * Docs for every phase up to and including the case's current phase — the UI reveals a phase's
 * documents once the case reaches it and keeps them visible thereafter.
 */
export function documentsThroughStage(stage: Stage): ChecklistDoc[] {
  const reached = phaseIndex(stage);
  const visiblePhases = new Set(PHASES.slice(0, reached + 1).map((p) => p.key));
  return DOCUMENT_CHECKLIST.filter((d) => visiblePhases.has(d.phase));
}
