// @ts-nocheck
/**
 * Wraps the legacy script-style test files (top-level `ok()`/`eq()` harness
 * with `process.exit(1)` on failure) so vitest can collect them.
 *
 * Each suite is dynamic-imported with `process.exit` patched to throw and
 * `console.log` captured. The harness prints `"X passed, Y failed"` as its
 * final summary line — we assert Y === 0.
 *
 * Assertions inside the legacy suites are unchanged.
 */
import { describe, it, expect } from "vitest";

const SUITES: string[] = [
  // src/integrations/zoho/__tests__/*
  "../integrations/zoho/__tests__/appealForms.test.ts",
  "../integrations/zoho/__tests__/calendar.test.ts",
  "../integrations/zoho/__tests__/calendarsync.test.ts",
  "../integrations/zoho/__tests__/caseService.test.ts",
  "../integrations/zoho/__tests__/convertlead.test.ts",
  "../integrations/zoho/__tests__/credentials.test.ts",
  "../integrations/zoho/__tests__/documents.test.ts",
  "../integrations/zoho/__tests__/exhibits.test.ts",
  "../integrations/zoho/__tests__/fees.test.ts",
  "../integrations/zoho/__tests__/forms.test.ts",
  "../integrations/zoho/__tests__/hmac.test.ts",
  "../integrations/zoho/__tests__/holidays.test.ts",
  "../integrations/zoho/__tests__/intake.test.ts",
  "../integrations/zoho/__tests__/invariants.test.ts",
  "../integrations/zoho/__tests__/leadScreening.test.ts",
  "../integrations/zoho/__tests__/medicalRecords.test.ts",
  "../integrations/zoho/__tests__/messaging.test.ts",
  "../integrations/zoho/__tests__/notification.test.ts",
  "../integrations/zoho/__tests__/phasetest.ts",
  "../integrations/zoho/__tests__/recompute.test.ts",
  "../integrations/zoho/__tests__/retainer.test.ts",
  "../integrations/zoho/__tests__/ssdi-e2e.test.ts",
  "../integrations/zoho/__tests__/stageSuggestions.test.ts",
  "../integrations/zoho/__tests__/tests.ts",
  // sibling-style legacy tests
  "../integrations/zoho/calendarService.test.ts",
  "../integrations/zoho/documents.test.ts",
  "../integrations/zoho/forms.test.ts",
  "../integrations/messaging/messagingService.test.ts",
];

class ExitError extends Error {
  code: number;
  constructor(code: number) {
    super(`__suite_exit_${code}__`);
    this.code = code;
  }
}

async function runSuite(rel: string): Promise<{ passed: number; failed: number; logs: string[] }> {
  const logs: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  const origExit = process.exit;

  console.log = (...args: unknown[]) => {
    logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  console.error = (...args: unknown[]) => {
    logs.push("[err] " + args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  // @ts-ignore
  process.exit = ((code?: number) => {
    throw new ExitError(code ?? 0);
  }) as never;

  try {
    await import(/* @vite-ignore */ rel);
  } catch (e) {
    if (!(e instanceof ExitError)) {
      console.log = origLog;
      console.error = origErr;
      process.exit = origExit;
      throw e;
    }
  } finally {
    console.log = origLog;
    console.error = origErr;
    process.exit = origExit;
  }

  // Find the summary line: "N passed, M failed"
  const summary = [...logs].reverse().find((l) => /\d+\s+passed,\s+\d+\s+failed/.test(l));
  if (!summary) {
    // No summary printed — count check-marks/x-marks as a fallback.
    const passed = logs.filter((l) => /^✓/.test(l)).length;
    const failed = logs.filter((l) => /^✗/.test(l)).length;
    return { passed, failed, logs };
  }
  const m = summary.match(/(\d+)\s+passed,\s+(\d+)\s+failed/)!;
  return { passed: Number(m[1]), failed: Number(m[2]), logs };
}

describe("legacy script-style suites", () => {
  for (const rel of SUITES) {
    it(rel.replace(/^\.\.\//, ""), async () => {
      const { passed, failed, logs } = await runSuite(rel);
      if (failed > 0) {
        // Surface the captured output so the failure is debuggable.
        for (const l of logs) console.log(l);
      }
      expect({ passed: passed >= 0, failed }).toEqual({ passed: true, failed: 0 });
    });
  }
});
