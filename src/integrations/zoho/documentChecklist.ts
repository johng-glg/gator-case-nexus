/**
 * documentChecklist.ts — required SSA / OHO documents per case phase.
 *
 * Pure metadata; no Zoho writes. The case page surfaces this as a checklist
 * with per-case local persistence so attorneys can track what's been
 * sent/received without waiting on a CRM round-trip.
 */
import { PHASES, phaseForStage, type Stage } from "./lifecycle";

export interface ChecklistDoc {
  code: string;
  title: string;
  description: string;
  /** Optional: link to the official SSA form PDF. */
  url?: string;
}

export interface ChecklistGroup {
  phaseKey: string;
  phaseLabel: string;
  docs: ChecklistDoc[];
}

/**
 * Documents grouped by lifecycle phase. Each phase's docs are "active" once
 * the case enters that phase and remain visible thereafter (we want a running
 * record, not a disappearing list).
 */
export const PHASE_DOCS: Record<string, ChecklistDoc[]> = {
  intake: [
    {
      code: "SSA-1696",
      title: "Appointment of Representative",
      description: "Authorizes the firm to represent the claimant before SSA.",
      url: "https://www.ssa.gov/forms/ssa-1696.pdf",
    },
    {
      code: "SSA-827",
      title: "Authorization to Disclose Information",
      description: "HIPAA release. Expires one year after signing.",
      url: "https://www.ssa.gov/forms/ssa-827.pdf",
    },
    {
      code: "Retainer",
      title: "Fee agreement / retainer",
      description: "Signed fee agreement filed with SSA before the favorable decision.",
    },
  ],
  recon: [
    {
      code: "SSA-561",
      title: "Request for Reconsideration",
      description: "Filed within 60 days of the initial denial notice.",
      url: "https://www.ssa.gov/forms/ssa-561.pdf",
    },
    {
      code: "SSA-3441",
      title: "Disability Report — Appeal",
      description: "Updates medical, work, and treatment info since the initial decision.",
      url: "https://www.ssa.gov/forms/ssa-3441.pdf",
    },
  ],
  alj: [
    {
      code: "HA-501",
      title: "Request for Hearing by ALJ",
      description: "Filed within 60 days of the reconsideration denial.",
      url: "https://www.ssa.gov/forms/ha-501.pdf",
    },
    {
      code: "HA-520",
      title: "Request for Review of Hearing Decision",
      description: "Used when appealing an ALJ denial to the Appeals Council.",
      url: "https://www.ssa.gov/forms/ha-520.pdf",
    },
    {
      code: "Pre-hearing brief",
      title: "Pre-hearing memorandum",
      description: "Theory of disability, listings/grid argument, key exhibits.",
    },
  ],
  ac: [
    {
      code: "HA-520",
      title: "Request for Review of Hearing Decision",
      description: "Filed within 60 days of the ALJ decision.",
      url: "https://www.ssa.gov/forms/ha-520.pdf",
    },
    {
      code: "AC brief",
      title: "Appeals Council brief",
      description: "Identifies legal/factual errors in the ALJ decision.",
    },
  ],
  award: [
    {
      code: "Fee petition",
      title: "Fee petition or fee agreement confirmation",
      description: "Filed after the Notice of Award to collect approved fees.",
    },
  ],
};

/**
 * Returns the document groups for a case at the given stage: every phase
 * up to and including the case's current phase (so the list grows but never
 * shrinks). Phases with no documents are omitted.
 */
export function checklistForStage(stage: Stage): ChecklistGroup[] {
  const currentPhase = phaseForStage(stage);
  if (!currentPhase) return [];
  const currentIdx = PHASES.findIndex((p) => p.key === currentPhase.key);
  return PHASES.slice(0, currentIdx + 1)
    .filter((p) => PHASE_DOCS[p.key]?.length)
    .map((p) => ({
      phaseKey: p.key,
      phaseLabel: p.label,
      docs: PHASE_DOCS[p.key]!,
    }));
}
