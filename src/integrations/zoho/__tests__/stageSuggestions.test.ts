import { describe, it, expect } from "vitest";
import { getStageSuggestions, needsEvidenceGate, HEARING_STAGES } from "../stageSuggestions";

describe("stage suggestions", () => {
  it("returns at least one suggestion for every non-closed stage", () => {
    const stages = [
      "Retained",
      "Application filed",
      "Initial decision denied",
      "Initial decision approved",
      "Reconsideration filed",
      "Recon decision denied",
      "Recon decision approved",
      "ALJ hearing requested",
      "Hearing scheduled",
      "Hearing held",
      "ALJ decision denied",
      "ALJ decision approved",
      "Appeals Council requested",
      "AC decision denied",
      "AC decision approved",
      "Award / NOA received",
      "Fee petition filed",
    ] as const;
    for (const s of stages) {
      expect(getStageSuggestions(s).length).toBeGreaterThan(0);
    }
  });

  it("returns no suggestions for Closed", () => {
    expect(getStageSuggestions("Closed")).toEqual([]);
  });

  it("offers an advanceTo on stages with an obvious next step", () => {
    expect(getStageSuggestions("Initial decision denied")[0].advanceTo).toBe("Reconsideration filed");
    expect(getStageSuggestions("Recon decision denied")[0].advanceTo).toBe("ALJ hearing requested");
    expect(getStageSuggestions("ALJ decision denied")[0].advanceTo).toBe("Appeals Council requested");
  });

  it("flags federal-court as a separate engagement at AC denied", () => {
    const rows = getStageSuggestions("AC decision denied");
    expect(rows[0].tone).toBe("warn");
    expect(rows[0].label).toMatch(/separate engagement/i);
  });

  it("hearing-stage list matches the evidence-gate stages", () => {
    expect(HEARING_STAGES).toEqual([
      "ALJ hearing requested",
      "Hearing scheduled",
      "Hearing held",
    ]);
  });
});

describe("evidence-readiness gate", () => {
  it("blocks at any hearing stage when zero records received", () => {
    for (const s of HEARING_STAGES) {
      expect(needsEvidenceGate(s, 0)).toBe(true);
    }
  });

  it("clears as soon as a record is marked received", () => {
    for (const s of HEARING_STAGES) {
      expect(needsEvidenceGate(s, 1)).toBe(false);
    }
  });

  it("does not gate pre-hearing or post-hearing stages", () => {
    expect(needsEvidenceGate("Retained", 0)).toBe(false);
    expect(needsEvidenceGate("Reconsideration filed", 0)).toBe(false);
    expect(needsEvidenceGate("ALJ decision denied", 0)).toBe(false);
    expect(needsEvidenceGate("Award / NOA received", 0)).toBe(false);
  });
});
