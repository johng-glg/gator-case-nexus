/**
 * Stage-aware suggestions for the Action Center.
 *
 * Pure logic — given a stage (and a couple of pieces of evidence/state),
 * returns a prioritized list of "next on this case" suggestions tuned to
 * where the case actually is in the lifecycle.
 *
 * Tested in __tests__/stageSuggestions.test.ts. No I/O.
 */
import type { Stage } from "./lifecycle";

export type SuggestionIcon = "next" | "warn" | "doc" | "info" | "scale" | "money";

export interface StageSuggestion {
  /** Stable react key */
  key: string;
  /** Headline (one line) */
  label: string;
  /** Optional sub-line */
  hint?: string;
  icon: SuggestionIcon;
  /** If set, the row's button advances the case to this stage (E3: one-click). */
  advanceTo?: Stage;
  /** If set, the row's button scrolls to a section. */
  scrollTo?: "tasks" | "deadline" | "records" | "forms" | "messaging";
  /** Visual tone for the row. */
  tone?: "warn" | "info";
}

export const HEARING_STAGES: Stage[] = [
  "ALJ hearing requested",
  "Hearing scheduled",
  "Hearing held",
];

/** A case at or past ALJ-requested with zero received records is the #1 attorney risk. */
export function needsEvidenceGate(stage: Stage, receivedRecordCount: number): boolean {
  return HEARING_STAGES.includes(stage) && receivedRecordCount === 0;
}

/**
 * Suggestions ordered by what an experienced CM would do next at that stage.
 * Engine is intentionally small — the UI layers in form/portal/task/docs rows.
 */
export function getStageSuggestions(stage: Stage): StageSuggestion[] {
  switch (stage) {
    case "Retained":
      return [
        {
          key: "verify-dli",
          label: "Verify DLI / insured status",
          hint: "Confirm the claimant is insured for DIB and capture DLI",
          icon: "info",
          scrollTo: "tasks",
        },
        {
          key: "file-app",
          label: "File SSA application",
          hint: "Submit via SSA.gov or paper; record claim number",
          icon: "next",
          advanceTo: "Application filed",
        },
      ];

    case "Application filed":
      return [
        {
          key: "await-init",
          label: "Awaiting initial decision",
          hint: "Capture Notice date the moment it arrives",
          icon: "info",
          scrollTo: "deadline",
        },
      ];

    case "Initial decision denied":
      return [
        {
          key: "file-recon",
          label: "File Reconsideration (60 + 5 day clock)",
          hint: "20 CFR 404.909 — clock runs from notice +5",
          icon: "next",
          tone: "warn",
          advanceTo: "Reconsideration filed",
        },
      ];

    case "Initial decision approved":
    case "Recon decision approved":
    case "ALJ decision approved":
    case "AC decision approved":
      return [
        {
          key: "capture-noa",
          label: "Capture Award / NOA",
          hint: "Enter NOA date and past-due amount to compute fee",
          icon: "money",
          advanceTo: "Award / NOA received",
        },
      ];

    case "Reconsideration filed":
      return [
        {
          key: "await-recon",
          label: "Awaiting reconsideration decision",
          hint: "Start building medical evidence now for the likely ALJ stage",
          icon: "info",
          scrollTo: "records",
        },
      ];

    case "Recon decision denied":
      return [
        {
          key: "request-alj",
          label: "Request ALJ hearing (60 + 5 day clock)",
          hint: "20 CFR 404.933",
          icon: "next",
          tone: "warn",
          advanceTo: "ALJ hearing requested",
        },
      ];

    case "ALJ hearing requested":
      return [
        {
          key: "evidence-push",
          label: "Push medical evidence collection",
          hint: "Records, opinion letters, RFC forms — bulk follow-up if needed",
          icon: "doc",
          tone: "warn",
          scrollTo: "records",
        },
      ];

    case "Hearing scheduled":
      return [
        {
          key: "five-day",
          label: "5-day rule: submit / identify evidence",
          hint: "HALLEX I-2-6-58 — all evidence in or identified ≥5 business days pre-hearing",
          icon: "warn",
          tone: "warn",
          scrollTo: "records",
        },
        {
          key: "pre-hearing-brief",
          label: "Prepare pre-hearing brief & exhibit index",
          hint: "Theory of case, VE/ME interrogatories, witness list",
          icon: "scale",
          scrollTo: "tasks",
        },
        {
          key: "hearing-held",
          label: "Mark hearing held",
          icon: "next",
          advanceTo: "Hearing held",
        },
      ];

    case "Hearing held":
      return [
        {
          key: "await-alj",
          label: "Awaiting ALJ decision",
          hint: "Average 30-60 days; longer for some hearing offices",
          icon: "info",
        },
      ];

    case "ALJ decision denied":
      return [
        {
          key: "ac-request",
          label: "Request Appeals Council review (60 + 5)",
          hint: "20 CFR 404.968",
          icon: "next",
          tone: "warn",
          advanceTo: "Appeals Council requested",
        },
      ];

    case "Appeals Council requested":
      return [
        {
          key: "await-ac",
          label: "Awaiting AC decision",
          hint: "Long wait — keep client on a quarterly status touchpoint",
          icon: "info",
          scrollTo: "messaging",
        },
      ];

    case "AC decision denied":
      return [
        {
          key: "fed-court",
          label: "Federal court is a separate engagement",
          hint: "If pursued, open a new representation (litigation retainer)",
          icon: "warn",
          tone: "warn",
        },
      ];

    case "Award / NOA received":
      return [
        {
          key: "fee-petition",
          label: "File fee petition (if not on fee agreement)",
          hint: "Reconcile costs, draft petition",
          icon: "money",
          advanceTo: "Fee petition filed",
        },
      ];

    case "Fee petition filed":
      return [
        {
          key: "await-fee",
          label: "Awaiting fee authorization",
          icon: "info",
        },
      ];

    case "Closed":
      return [];
  }
}
