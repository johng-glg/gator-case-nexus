// @ts-nocheck
import { createIntakeService } from "../intakeService";
const NOW = () => new Date(Date.UTC(2026, 5, 20));
const calls: any[] = [];
let coqlReturn: any[] = [];
const api = {
  async coql(q: string) { calls.push({ op: "coql", q }); return coqlReturn; },
  async createRecords(m: string, recs: any[]) {
    calls.push({ op: "create", m, rec: recs[0] });
    return [{ code: "SUCCESS", details: { id: m === "Contacts" ? "C1" : m === "Engagements" ? "E1" : "K1" } }];
  },
  async updateRecords() { return []; }, async getRecord() { return null; }, async deleteRecords() { return []; },
};
const zoho = { as: () => api } as any;
const svc = createIntakeService({ zoho, now: NOW });
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? "✓" : "✗"} ${l}`); c ? pass++ : fail++; };

(async () => {
  // conflict check — no matches
  coqlReturn = [];
  let cc = await svc.runConflictCheck("u", { lastName: "Smith", email: "a@b.com" });
  ok("clear when no matches", cc.status === "Cleared");
  ok("conflict COQL uses single quotes", calls.find(c => c.op === "coql").q.includes("Last_Name = 'Smith'"));
  // conflict check — match found + apostrophe escape
  coqlReturn = [{ id: "X9", Last_Name: "O'Brien" }];
  cc = await svc.runConflictCheck("u", { lastName: "O'Brien" });
  ok("conflict found when match", cc.status === "Conflict found" && cc.matches.length === 1);
  ok("apostrophe escaped (O''Brien)", calls.find(c => c.op === "coql" && c.q.includes("O''Brien")) !== undefined);

  // full intake create
  calls.length = 0;
  const out = await svc.createIntake("u", {
    client: { firstName: "Jane", lastName: "Doe", email: "jane@x.com", ssn: "111-22-3333" },
    conflict: { status: "Cleared" },
    actorZohoUserId: "U7",
  });
  ok("returns client + engagement ids", out.clientId === "C1" && out.engagementId === "E1");
  ok("no case created at intake", !calls.some(c => c.op === "create" && c.m === "SSDI_Cases"));
  ok("no caseId returned", !("caseId" in out));
  const eng = calls.find(c => c.op === "create" && c.m === "Engagements").rec;
  ok("engagement type=SSDI", eng.Engagement_Type === "SSDI");
  ok("engagement links client", eng.Client.id === "C1");
  ok("engagement conflict recorded", eng.Conflict_Check_Status === "Cleared" && eng.Conflict_Check_Date === "2026-06-20");
  ok("conflict_check_by = actor", eng.Conflict_Check_By.id === "U7");
  ok("engagement name formatted", eng.Name === "Doe, Jane — SSDI");
  ok("blank fields dropped (no Mobile)", !("Mobile" in calls.find(c => c.m === "Contacts").rec));

  // reuse existing client → skip Contact create
  calls.length = 0;
  await svc.createIntake("u", { clientId: "EXISTING", client: { firstName: "A", lastName: "B" },
    conflict: { status: "Cleared" } });
  ok("existing clientId skips Contact create", !calls.some(c => c.m === "Contacts"));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
