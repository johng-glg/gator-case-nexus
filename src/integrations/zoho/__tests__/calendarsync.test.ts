// @ts-nocheck
import { createCalendarSyncService } from "../calendarSyncService";
import { desiredEventsForCase, signature } from "../calendarService";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? "✓" : "✗"} ${l}`); c ? pass++ : fail++; };

function mocks(initialLinks: Record<string, { eventId: string; sig: string }> = {}) {
  const store: Record<string, { eventId: string; sig: string }> = { ...initialLinks };
  const calls: any[] = [];
  let n = 0;
  const cal = {
    async insert(_c: string, e: any) { calls.push({ op: "insert", key: e.key }); return "g" + (++n); },
    async update(_c: string, id: string, e: any) { calls.push({ op: "update", id, key: e.key }); },
    async remove(_c: string, id: string) { calls.push({ op: "remove", id }); },
  };
  const links = {
    async get() { return { ...store }; },
    async upsert(_cid: string, key: string, eventId: string, sig: string) { store[key] = { eventId, sig }; },
    async remove(_cid: string, key: string) { delete store[key]; },
  };
  return { cal, links, calls, store };
}

const CASE = { Deadline_Date: "2026-08-05", Active_Deadline_Type: "Reconsideration", ALJ_Hearing_Scheduled_Date: "2026-09-10T14:30:00-04:00", Hearing_Office_ODAR: "Orange OHO" };
const META = { caseId: "K1", label: "Doe, Jane", caseUrl: "https://app/cases/K1" };

await (async () => {
  // create both on empty
  let m = mocks();
  let r = await createCalendarSyncService({ ...m, calendarId: "CAL" }).syncCase(CASE, META);
  ok("creates both events", r.created === 2 && r.updated === 0 && r.deleted === 0);
  ok("links persisted", !!m.store["deadline:K1"] && !!m.store["hearing:K1"]);

  // re-run = no-op
  r = await createCalendarSyncService({ ...m, calendarId: "CAL" }).syncCase(CASE, META);
  ok("re-run is a no-op (idempotent)", r.created === 0 && r.updated === 0 && r.deleted === 0);

  // move the deadline → single update, reuse id
  const movedCase = { ...CASE, Deadline_Date: "2026-08-12" };
  const beforeId = m.store["deadline:K1"].eventId;
  r = await createCalendarSyncService({ ...m, calendarId: "CAL" }).syncCase(movedCase, META);
  ok("date move = one update", r.updated === 1 && r.created === 0);
  ok("update reused the same google event id", m.store["deadline:K1"].eventId === beforeId);

  // closing the case deletes everything
  r = await createCalendarSyncService({ ...m, calendarId: "CAL" }).syncCase({ ...movedCase, Is_Closed: true }, META);
  ok("close deletes both", r.deleted === 2 && Object.keys(m.store).length === 0);

  console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
})();
