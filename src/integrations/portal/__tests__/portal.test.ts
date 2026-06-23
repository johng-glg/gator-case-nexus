// @ts-nocheck
import { describe, expect, it } from "vitest";
import { buildPortalView, ssdiToPortalMatter, type PortalMatter } from "../portal";
import { fcraPortalAdapter } from "../adapters/stubs";

describe("portal contract", () => {
  it("SSDI adapter frames denials as appeals, never as 'denied'", () => {
    const m = ssdiToPortalMatter({
      engagementId: "eng_1",
      stage: "Initial decision denied",
      retainerSigned: true,
    });
    expect(m.statusLabel).toBe(
      "Initial decision received — we're handling your appeal",
    );
    expect(m.statusLabel.toLowerCase()).not.toContain("denied");
  });

  it("SSDI adapter ignores extra fields cast on as any (no leak path)", () => {
    const dirty = {
      engagementId: "eng_2",
      stage: "Retained",
      retainerSigned: true,
      // Fields that must never reach the portal:
      fee_amount: 7500,
      internal_notes: "client is flaky",
      strategy_notes: "push for OTR",
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = ssdiToPortalMatter(dirty as any);
    const serialized = JSON.stringify(m);
    expect(serialized).not.toContain("7500");
    expect(serialized).not.toContain("flaky");
    expect(serialized).not.toContain("OTR");
  });

  it("pre-retainer status nudges the client to sign", () => {
    const m = ssdiToPortalMatter({
      engagementId: "eng_3",
      stage: "Retained",
      retainerSigned: false,
    });
    expect(m.statusLabel).toMatch(/sign your representation agreement/i);
    expect(m.actionsNeeded[0]).toMatchObject({ type: "sign" });
  });

  it("doc requests become upload actions with opaque refs", () => {
    const m = ssdiToPortalMatter({
      engagementId: "eng_4",
      stage: "Application filed",
      retainerSigned: true,
      openDocRequests: [{ id: "dr_1", label: "Recent medical records" }],
    });
    expect(m.actionsNeeded).toContainEqual({
      type: "upload",
      label: "Upload: Recent medical records",
      ref: "dr_1",
    });
  });

  it("buildPortalView rolls actions across matters", () => {
    const matters: PortalMatter[] = [
      ssdiToPortalMatter({
        engagementId: "ssdi-1",
        stage: "Retained",
        retainerSigned: false,
      }),
      fcraPortalAdapter.toMatter({ engagementId: "fcra-1" }),
    ];
    const view = buildPortalView(matters);
    expect(view.matters).toHaveLength(2);
    expect(view.actionsSummary).toHaveLength(1);
    expect(view.actionsSummary[0].matterId).toBe("ssdi-1");
  });
});
