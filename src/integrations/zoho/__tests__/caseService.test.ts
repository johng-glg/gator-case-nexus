// @ts-nocheck
import { createCaseService } from "../caseService";

// --- mock Zoho client capturing calls ---
function mockZoho(record: Record<string, unknown>) {
  const calls: any[] = [];
  const api = {
    async getRecord(_m: string, _id: string) { return record; },
    async updateRecords(m: string, recs: any[]) { calls.push({ op: "update", m, recs }); return recs; },
    async createRecords(m: string, recs: any[]) { calls.push({ op: "create", m, recs }); return recs; },
    async coql() { return []; },
    async deleteRecords() { return []; },
  };
  return { client: { as: (_k: string) => api, service: () => api, authorizeUrl: () => "", handleCallback: async () => {} } as any, calls };
}

let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? "✓" : "✗"} ${l}`); c ? pass++ : fail++; };
const NOW = () => new Date(Date.UTC(2026, 5, 1)); // 2026-06-01

await (async () => {
  // case currently at "Initial decision pending", we deny it with a notice date
  const { client, calls } = mockZoho({ Current_Stage: "Initial decision pending" });
  const svc = createCaseService({ zoho: client, now: NOW });
  const res = await svc.advanceStage("user1", "CASE1", "Initial decision denied", {
    fields: { Initial_Decision_Date: "2026-06-01", Notice_Date: "2026-06-01" },
  });

  const upd = calls.find((c) => c.op === "update").recs[0];
  ok("stage written", upd.Current_Stage === "Initial decision denied");
  ok("active deadline tier = Reconsideration", upd.Active_Deadline_Type === "Reconsideration");
  ok("deadline = 2026-08-05 (notice+65)", upd.Deadline_Date === "2026-08-05");
  ok("days-to-deadline computed", typeof upd.Days_To_Deadline === "number" && upd.Days_To_Deadline === 65);
  ok("captured field merged (Initial_Decision_Date)", upd.Initial_Decision_Date === "2026-06-01");
  ok("returned deadline", res.deadline === "2026-08-05");

  const tasks = calls.find((c) => c.op === "create");
  ok("task created in Tasks module", tasks?.m === "Tasks");
  ok("task = File reconsideration", tasks?.recs[0].Subject === "File reconsideration");
  ok("task due = deadline − 5 = 2026-07-31", tasks?.recs[0].Due_Date === "2026-07-31");
  ok("task linked to case", tasks?.recs[0].What_Id.id === "CASE1" && tasks?.recs[0]["$se_module"] === "SSDI_Cases");

  // invalid transition rejected
  let threw = false;
  const m2 = mockZoho({ Current_Stage: "Retained" });
  try { await createCaseService({ zoho: m2.client, now: NOW }).advanceStage("u", "C", "Hearing held"); }
  catch { threw = true; }
  ok("invalid transition throws", threw);

  // setDeadline without Notice_Date throws
  let threw2 = false;
  const m3 = mockZoho({ Current_Stage: "Recon decision pending" });
  try { await createCaseService({ zoho: m3.client, now: NOW }).advanceStage("u", "C", "Recon decision denied"); }
  catch { threw2 = true; }
  ok("denial without Notice_Date throws", threw2);

  // ---- stage-gate validation ----
  // Hearing scheduled requires the hearing date + type
  let threwHS = false;
  const m4 = mockZoho({ Current_Stage: "ALJ hearing requested" });
  let missingHS: any[] = [];
  try { await createCaseService({ zoho: m4.client, now: NOW }).advanceStage("u", "C", "Hearing scheduled", { fields: { ALJ_Hearing_Scheduled_Date: "2026-09-10" } }); }
  catch (e: any) { threwHS = true; missingHS = e.missing ?? []; }
  ok("Hearing scheduled blocked without Hearing_Type", threwHS);
  ok("error carries structured missing field + label", missingHS.some((m) => m.field === "Hearing_Type" && m.label === "Hearing type"));

  // ...passes once both provided
  const m5 = mockZoho({ Current_Stage: "ALJ hearing requested" });
  const okHS = await createCaseService({ zoho: m5.client, now: NOW }).advanceStage("u", "C", "Hearing scheduled", { fields: { ALJ_Hearing_Scheduled_Date: "2026-09-10", Hearing_Type: "In person" } });
  ok("Hearing scheduled allowed with date + type", okHS.to === "Hearing scheduled");

  // required field already on the case (not in the form) also satisfies
  const m6 = mockZoho({ Current_Stage: "ALJ hearing requested", ALJ_Hearing_Scheduled_Date: "2026-09-10", Hearing_Type: "Video" });
  const okHS2 = await createCaseService({ zoho: m6.client, now: NOW }).advanceStage("u", "C", "Hearing scheduled");
  ok("required field satisfied from existing case data", okHS2.to === "Hearing scheduled");

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
