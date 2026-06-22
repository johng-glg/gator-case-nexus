import { desiredEventsForCase, reconcile, signature, type CalEvent } from "./calendarService";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? "✓" : "✗"} ${l}`); c ? pass++ : fail++; };

(async () => {
  // desired events
  const ev = desiredEventsForCase(
    { Deadline_Date: "2026-08-05", Active_Deadline_Type: "Reconsideration",
      ALJ_Hearing_Scheduled_Date: "2026-09-10T14:30:00-04:00", Hearing_Office_ODAR: "Orange OHO", ALJ_Name: "Hon. Reyes" },
    { caseId: "K1", label: "Doe, Jane", caseUrl: "https://app/cases/K1" },
  );
  ok("two events (deadline + hearing)", ev.length === 2);
  const dl = ev.find((e) => e.key === "deadline:K1")!;
  ok("deadline is all-day on Deadline_Date", dl.allDay && dl.start === "2026-08-05");
  ok("deadline title has tier + label", dl.title === "SSDI Reconsideration deadline — Doe, Jane");
  const hr = ev.find((e) => e.key === "hearing:K1")!;
  ok("hearing is timed (not all-day)", hr.allDay === false && hr.start.startsWith("2026-09-10T"));
  ok("hearing carries office as location + ALJ in desc", hr.location === "Orange OHO" && hr.description!.includes("Hon. Reyes"));

  // closed case → no events
  ok("closed case yields no events", desiredEventsForCase({ Is_Closed: true, Deadline_Date: "2026-08-05", Active_Deadline_Type: "ALJ Hearing" }, { caseId: "K1", label: "x" }).length === 0);
  // no tier / None → no deadline event
  ok("no deadline event when tier None", desiredEventsForCase({ Deadline_Date: "2026-08-05", Active_Deadline_Type: "None" }, { caseId: "K1", label: "x" }).length === 0);

  // reconcile: create when nothing stored
  let actions = reconcile(ev, {});
  ok("reconcile creates both when map empty", actions.length === 2 && actions.every((a) => a.op === "create"));

  // reconcile: no-op when sigs match
  const existing = Object.fromEntries(ev.map((e) => [e.key, { eventId: "g_" + e.key, sig: signature(e) }]));
  ok("reconcile no-ops when unchanged", reconcile(ev, existing).length === 0);

  // reconcile: update when deadline date moves
  const moved = ev.map((e) => e.key === "deadline:K1" ? { ...e, start: "2026-08-12", title: e.title } as CalEvent : e);
  actions = reconcile(moved, existing);
  ok("reconcile updates only the changed event", actions.length === 1 && actions[0].op === "update" && actions[0].key === "deadline:K1");
  ok("update reuses stored eventId", actions[0].op === "update" && actions[0].eventId === "g_deadline:K1");

  // reconcile: delete when an event is no longer desired (e.g. case closed)
  actions = reconcile([], existing);
  ok("reconcile deletes orphaned events", actions.length === 2 && actions.every((a) => a.op === "delete"));

  console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
})();
