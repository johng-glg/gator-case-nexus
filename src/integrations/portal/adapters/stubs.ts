/**
 * Stub adapters for practices that haven't been fully wired into the portal yet.
 * They expose only the minimum allowlist — engagement id, title, status — so the
 * shell can render any practice with zero risk of leaking case-specific data.
 */
import type { PortalMatter, PortalPracticeAdapter, Practice } from "../portal";

interface StubInput {
  engagementId: string;
  attorney?: string;
  updatedAt?: string;
}

function makeStub(
  practice: Practice,
  title: string,
  statusLabel: string,
): PortalPracticeAdapter<StubInput> {
  return {
    practice,
    toMatter(input: StubInput): PortalMatter {
      return {
        id: input.engagementId,
        practice,
        title,
        statusLabel,
        actionsNeeded: [],
        keyDates: [],
        attorney: input.attorney,
        updatedAt: input.updatedAt,
      };
    },
  };
}

export const fcraPortalAdapter = makeStub(
  "FCRA",
  "Credit report dispute",
  "Dispute in progress",
);

export const fdcpaPortalAdapter = makeStub(
  "FDCPA",
  "Debt-collection dispute",
  "Dispute in progress",
);

export const tcpaPortalAdapter = makeStub(
  "TCPA",
  "TCPA matter",
  "We're reviewing your claim",
);

// Class action intentionally exposes the LEAST data — no other-client data must
// ever reach the portal for a class matter.
export const classActionPortalAdapter = makeStub(
  "Class Action",
  "Class action",
  "We'll update you when there's news",
);
