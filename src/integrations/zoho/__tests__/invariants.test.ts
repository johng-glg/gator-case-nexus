// @ts-nocheck
import { TRANSITIONS, HOOKS, PHASES, REQUIRED_FIELDS, phaseIndex, type Stage } from "../lifecycle";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? "✓" : "✗"} ${l}`); c ? pass++ : fail++; };

const allStages = Object.keys(TRANSITIONS) as Stage[];

// PHASES partition every stage exactly once
const phaseStages = PHASES.flatMap((p) => p.stages);
ok("PHASES cover every stage", allStages.every((s) => phaseStages.includes(s)));
ok("PHASES list no stray/unknown stage", phaseStages.every((s) => allStages.includes(s)));
ok("PHASES have no duplicate stages", new Set(phaseStages).size === phaseStages.length);

// every HOOKS / REQUIRED_FIELDS key is a real stage
ok("HOOKS keys are valid stages", Object.keys(HOOKS).every((s) => allStages.includes(s as Stage)));
ok("REQUIRED_FIELDS keys are valid stages", Object.keys(REQUIRED_FIELDS).every((s) => allStages.includes(s as Stage)));

// every transition target is a real stage
const badTarget = allStages.flatMap((s) => TRANSITIONS[s]).find((t) => !allStages.includes(t));
ok("all transition targets are valid stages", badTarget === undefined);

// every non-terminal stage can move somewhere; Closed is terminal
ok("only Closed is terminal", allStages.filter((s) => TRANSITIONS[s].length === 0).join() === "Closed");

// phaseIndex monotonic-ish: Retained=0, Closed=last
ok("Retained is phase 0", phaseIndex("Retained") === 0);
ok("Closed is the last phase", phaseIndex("Closed") === PHASES.length - 1);

// every stage reachable from Retained (BFS over TRANSITIONS, Closed reachable from all)
const seen = new Set<Stage>(["Retained"]); const q: Stage[] = ["Retained"];
while (q.length) { for (const n of TRANSITIONS[q.shift()!]) if (!seen.has(n)) { seen.add(n); q.push(n); } }
ok("every stage reachable from Retained", allStages.every((s) => seen.has(s)));

console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
