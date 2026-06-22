// @ts-nocheck
import { DOCUMENT_CHECKLIST, DOC_STATUSES, documentsForPhase, documentByCode, documentsThroughStage } from "../documents";
import { PHASES } from "../lifecycle";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? "✓" : "✗"} ${l}`); c ? pass++ : fail++; };

// codes unique + stable
const codes = DOCUMENT_CHECKLIST.map((d) => d.code);
ok("doc codes are unique", new Set(codes).size === codes.length);

// every doc's phase is a real PHASES key
const phaseKeys = new Set(PHASES.map((p) => p.key));
ok("every doc maps to a real phase", DOCUMENT_CHECKLIST.every((d) => phaseKeys.has(d.phase)));

// statuses
ok("four statuses", DOC_STATUSES.length === 4 && DOC_STATUSES[0] === "To do" && DOC_STATUSES[3] === "Filed");

// intake docs include the e-sign forms
const intake = documentsForPhase("intake").map((d) => d.code);
ok("intake has SSA-1696 + SSA-827 + retainer", intake.includes("SSA-1696") && intake.includes("SSA-827") && intake.includes("retainer"));

// lookup
ok("documentByCode finds HA-501 with url", documentByCode("HA-501")?.url?.endsWith("ha-501.pdf") === true);
ok("unknown code → undefined", documentByCode("nope") === undefined);

// progressive reveal: a Retained case sees only intake docs; an ALJ case sees intake→alj
ok("Retained shows only intake docs", documentsThroughStage("Retained").every((d) => d.phase === "intake"));
const aljPhases = new Set(documentsThroughStage("Hearing scheduled").map((d) => d.phase));
ok("ALJ-phase case reveals intake..alj", aljPhases.has("intake") && aljPhases.has("recon") && aljPhases.has("alj") && !aljPhases.has("ac"));

console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
