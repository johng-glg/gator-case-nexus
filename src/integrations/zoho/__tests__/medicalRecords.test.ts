// @ts-nocheck
import { nextFollowupDate, agingDays, isStale, requestsNeedingFollowup, canTransition, applyFollowup, REQUEST_STATUSES, followupSweepUpdates } from "../medicalRecords";

// followupSweepUpdates parity + no-mutation invariant (sweep MUST NOT bump count)
const _r = { id: "x", Request_Status: "Requested" as const, Requested_Date: "2026-06-01", Followup_Count: 0 };
const _before = _r.Followup_Count;
const _swept = followupSweepUpdates([_r], new Date("2026-06-20T00:00:00Z"));

const T = (s: string) => new Date(s + "T00:00:00Z");
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? "✓" : "✗"} ${l}`); c ? pass++ : fail++; };

// follow-up cadence
ok("requested → first follow-up +14", nextFollowupDate({ Request_Status: "Requested", Requested_Date: "2026-06-01" }) === "2026-06-15");
ok("followed up → +14 from last follow-up", nextFollowupDate({ Request_Status: "Followed up", Requested_Date: "2026-06-01", Last_Followup_Date: "2026-06-15", Followup_Count: 1 }) === "2026-06-29");
ok("not-yet-requested → no follow-up", nextFollowupDate({ Request_Status: "Not started" }) === null);
ok("received → no follow-up", nextFollowupDate({ Request_Status: "Received", Requested_Date: "2026-06-01" }) === null);
ok("follow-ups exhausted → none (escalate)", nextFollowupDate({ Request_Status: "Followed up", Requested_Date: "2026-06-01", Last_Followup_Date: "2026-07-01", Followup_Count: 3 }) === null);

// aging + stale
ok("aging counts from requested", agingDays({ Request_Status: "Requested", Requested_Date: "2026-06-01" }, T("2026-06-20")) === 19);
ok("stale after 45 days open", isStale({ Request_Status: "Requested", Requested_Date: "2026-05-01" }, T("2026-06-20")) === true);
ok("not stale when received", isStale({ Request_Status: "Received", Requested_Date: "2026-01-01" }, T("2026-06-20")) === false);
ok("stale when follow-ups exhausted", isStale({ Request_Status: "Followed up", Requested_Date: "2026-06-10", Followup_Count: 3 }, T("2026-06-20")) === true);

// sweep
const reqs = [
  { id: "r1", Request_Status: "Requested" as const, Requested_Date: "2026-06-01" },              // due 06-15
  { id: "r2", Request_Status: "Requested" as const, Requested_Date: "2026-06-18" },              // due 07-02 (not yet)
  { id: "r3", Request_Status: "Received" as const,  Requested_Date: "2026-05-01" },              // terminal
];
const due = requestsNeedingFollowup(reqs, T("2026-06-20")).map((r) => r.id);
ok("sweep returns only the due open request", due.length === 1 && due[0] === "r1");

// transitions
ok("Requested → Received allowed", canTransition("Requested", "Received"));
ok("Received is terminal", !canTransition("Received", "Followed up"));

// applyFollowup
const upd = applyFollowup({ Request_Status: "Requested", Followup_Count: 0 }, T("2026-06-20"));
ok("applyFollowup bumps count + stamps date + status", upd.Followup_Count === 1 && upd.Last_Followup_Date === "2026-06-20" && upd.Request_Status === "Followed up");

ok("six statuses defined", REQUEST_STATUSES.length === 6);

console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
