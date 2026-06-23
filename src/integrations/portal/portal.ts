/**
 * portal.ts — client portal contract (firm-wide, multi-practice).
 *
 * The portal is keyed to the CLIENT (Contact), not a case, and shows ALL their matters across
 * practices (SSDI / FCRA / FDCPA / TCPA / Class Action). Each practice maps its data into the same
 * `PortalMatter` shape via an adapter — so adding FCRA is a new adapter, not a portal rewrite. The
 * adapter is the ONLY place client-facing data is shaped, so the client-safe allowlist lives here:
 * an adapter can only output the fields below — no fees, no internal notes, no strategy.
 */
export type Practice = "SSDI" | "FCRA" | "FDCPA" | "TCPA" | "Class Action";

export interface PortalAction {
  type: "sign" | "upload" | "questionnaire" | "info";
  label: string;
  ref?: string; // opaque id the UI uses to route (e.g. doc-request id) — never internal data
}

export interface PortalKeyDate {
  label: string;
  date: string;
}

/** Everything — and only — what a client may see about one matter. */
export interface PortalMatter {
  id: string; // engagement id
  caseId?: string; // practice case id, when the matter has an opened case
  practice: Practice;
  title: string; // plain-language ("Social Security Disability")
  statusLabel: string; // plain-language status ("Awaiting the initial decision")
  statusDetail?: string;
  actionsNeeded: PortalAction[];
  keyDates: PortalKeyDate[];
  attorney?: string;
  updatedAt?: string;
}

/** A practice maps its engagement/case data → a PortalMatter using only allowlisted inputs. */
export interface PortalPracticeAdapter<TInput> {
  practice: Practice;
  toMatter(input: TInput): PortalMatter;
}

export interface PortalView {
  matters: PortalMatter[];
  /** Cross-matter "what needs you" roll-up for the landing page. */
  actionsSummary: { matterId: string; matterTitle: string; action: PortalAction }[];
}

/** Assemble the client's landing view from their matters (any practices). */
export function buildPortalView(matters: PortalMatter[]): PortalView {
  const actionsSummary = matters.flatMap((m) =>
    m.actionsNeeded.map((action) => ({ matterId: m.id, matterTitle: m.title, action })),
  );
  return { matters, actionsSummary };
}

// ---------- SSDI adapter ----------

/** Client-SAFE inputs only. The Lovable server passes just these — never fees/notes/strategy. */
export interface SsdiPortalInput {
  engagementId: string;
  caseId?: string;
  stage: string; // Current_Stage (or "Retained" pre-case at engagement level)
  retainerSigned?: boolean;
  hearingDate?: string; // ALJ_Hearing_Scheduled_Date
  attorney?: string;
  openDocRequests?: { id: string; label: string }[];
  questionnaireOutstanding?: boolean;
  updatedAt?: string;
}

/**
 * Plain-language, client-facing status. Adverse outcomes are framed as "appealing", never "DENIED"
 * (adverse news is delivered by the attorney, per the messaging rules).
 */
const SSDI_STATUS: Record<string, string> = {
  Retained: "We've been retained — preparing your application",
  "Application filed": "Application filed — awaiting a decision",
  "Initial decision pending": "Awaiting the initial decision",
  "Initial decision denied": "Initial decision received — we're handling your appeal",
  "Initial decision approved": "Approved — finalizing your award",
  "Reconsideration filed": "Reconsideration filed — awaiting a decision",
  "Recon decision pending": "Awaiting the reconsideration decision",
  "Recon decision denied": "Reconsideration received — we're requesting a hearing",
  "Recon decision approved": "Approved — finalizing your award",
  "ALJ hearing requested": "Hearing requested — awaiting scheduling",
  "Hearing scheduled": "Your hearing is scheduled",
  "Hearing prep": "Preparing for your hearing",
  "Hearing held": "Hearing held — awaiting the judge's decision",
  "ALJ decision pending": "Awaiting the judge's decision",
  "ALJ decision denied": "Decision received — we're reviewing next steps with you",
  "ALJ decision approved": "Approved — finalizing your award",
  "Appeals Council requested": "Appeals Council review requested",
  "AC decision pending": "Awaiting Appeals Council review",
  "AC decision denied": "Review received — we'll discuss next steps with you",
  "AC decision approved": "Approved — finalizing your award",
  "Award / NOA received": "Approved — finalizing your award",
  "Fee petition filed": "Finalizing your award",
  Closed: "Your case is closed",
};

export function ssdiToPortalMatter(input: SsdiPortalInput): PortalMatter {
  const actionsNeeded: PortalAction[] = [];
  if (input.retainerSigned === false) {
    actionsNeeded.push({ type: "sign", label: "Sign your representation agreement" });
  }
  // The questionnaire route is not a live form yet, so don't present it as an
  // action clients can complete. Re-enable this when the full intake form ships.
  for (const r of input.openDocRequests ?? []) {
    actionsNeeded.push({ type: "upload", label: `Upload: ${r.label}`, ref: r.id });
  }

  const keyDates: PortalKeyDate[] = [];
  if (input.hearingDate) keyDates.push({ label: "Hearing", date: input.hearingDate });

  const statusLabel =
    input.retainerSigned === false
      ? "Action needed — sign your representation agreement"
      : SSDI_STATUS[input.stage] ?? "In progress";

  return {
    id: input.engagementId,
    caseId: input.caseId,
    practice: "SSDI",
    title: "Social Security Disability",
    statusLabel,
    actionsNeeded,
    keyDates,
    attorney: input.attorney,
    updatedAt: input.updatedAt,
  };
}

export const ssdiPortalAdapter: PortalPracticeAdapter<SsdiPortalInput> = {
  practice: "SSDI",
  toMatter: ssdiToPortalMatter,
};
