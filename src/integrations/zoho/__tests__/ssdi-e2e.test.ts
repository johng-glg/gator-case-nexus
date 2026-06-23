// @ts-nocheck
/**
 * ssdi-e2e.test.ts — integration harness: drive the whole SSDI spine through one in-memory Zoho.
 * lead → convert → retainer sent → signed (webhook) → case opens + SSA-1696 sent → advance to a
 * denial (deadline computed) → calendar event → milestone email. Proves the services compose.
 */
import { createIntakeService, createSsdiCaseOpener } from "../intakeService";
import { createRetainerService } from "../retainerService";
import { createFormsService, gatorIntakeForms } from "../formsService";
import { createCaseService } from "../caseService";
import { createCalendarSyncService } from "../calendarSyncService";
import { createNotificationService } from "../notificationService";

let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? "✓" : "✗"} ${l}`); c ? pass++ : fail++; };
const NOW = () => new Date(Date.UTC(2026, 5, 20));

// ---- tiny in-memory Zoho with a good-enough COQL evaluator ----
function memoryZoho() {
  const db: Record<string, any> = {}; let seq = 1;
  const val = (r: any, f: string) => f.includes(".") ? f.split(".").reduce((o, k) => o?.[k], r) : r?.[f];
  function evalCoql(q: string) {
    const mod = /from\s+(\w+)/i.exec(q)?.[1];
    const whereM = /where\s+(.+?)(?:\s+limit\s+\d+.*)?$/i.exec(q);
    const rows = Object.values(db).filter((r: any) => r.__module === mod);
    if (!whereM) return rows;
    const ors = whereM[1].split(/\s+or\s+/i);
    const match = (r: any) => ors.some((clause) =>
      clause.split(/\s+and\s+/i).every((c) => {
        const m = /(\w+(?:\.\w+)?)\s*=\s*'?([^']*?)'?\s*$/.exec(c.trim()); if (!m) return false;
        let rv = val(r, m[1]); if (rv && typeof rv === "object" && "id" in rv) rv = rv.id;
        return String(rv) === m[2];
      }));
    return rows.filter(match);
  }
  const api = {
    async getRecord(mod: string, id: string) { const r = db[id]; return r && r.__module === mod ? { ...r } : null; },
    async coql(q: string) { return evalCoql(q); },
    async createRecords(mod: string, recs: any[]) { return recs.map((r) => { const id = `${mod}_${seq++}`; db[id] = { ...r, id, __module: mod }; return { code: "SUCCESS", details: { id } }; }); },
    async updateRecords(_mod: string, recs: any[]) { recs.forEach((r) => Object.assign(db[r.id], r)); return recs; },
    async deleteRecords() { return []; },
  };
  return { zoho: { as: () => api, service: () => api } as any, db };
}
function mockSign() { let n = 0; return { async sendTemplate() { return { requestId: "REQ" + (++n), signLink: "https://s/" + n }; } }; }

await (async () => {
  const { zoho, db } = memoryZoho();
  const sign = mockSign();
  const intake = createIntakeService({ zoho, now: NOW });
  const forms = createFormsService({ zoho, sign, now: NOW, forms: gatorIntakeForms({ ssa1696TemplateId: "T16", ssa1696ActionId: "A16", ssa827TemplateId: "T27", ssa827ActionId: "A27" }) });
  const openCase = createSsdiCaseOpener(zoho, { now: NOW });
  const retainer = createRetainerService({ zoho, sign, now: NOW, onRetainerSigned: async ({ engagementId }) => {
    const { caseId } = await openCase({ engagementId });
    if (caseId) await forms.sendIntakeForms("SERVICE", caseId);
  }});
  const cases = createCaseService({ zoho, now: NOW });

  // 1) lead → convert
  const leadId = (await zoho.as().createRecords("Leads", [{ First_Name: "Jane", Last_Name: "Doe", Email: "jane@x.com", Practice_Area: "SSDI", Lead_Status: "Qualified" }]))[0].details.id;
  const conv = await intake.convertLead("u", leadId);
  ok("lead converted → contact + engagement", !!conv.clientId && !!conv.engagementId);
  ok("lead stamped Converted", db[leadId].Lead_Status === "Converted" && db[leadId].Converted_Contact.id === conv.clientId);
  ok("no case created at conversion", !Object.values(db).some((r: any) => r.__module === "SSDI_Cases"));

  // 2) send retainer
  const sent = await retainer.sendRetainer("u", conv.engagementId);
  ok("retainer sent → engagement = Sent + Retainer_ID", db[conv.engagementId].Retainer_Status === "Sent" && !!db[conv.engagementId].Retainer_ID);

  // 3) signature webhook → case opens + SSA-1696 sent
  await retainer.handleSignCompleted({ notifications: { operation_type: "RequestCompleted" }, requests: { request_id: sent.requestId } });
  ok("retainer flipped Signed", db[conv.engagementId].Retainer_Status === "Signed");
  const kase: any = Object.values(db).find((r: any) => r.__module === "SSDI_Cases");
  ok("case opened at Retained", !!kase && kase.Current_Stage === "Retained");
  ok("SSA-1696 auto-sent on the case", kase.SSA1696_Status === "Sent" && !!kase.SSA1696_Request_ID);
  ok("SSA-827 NOT auto-sent (attestation)", kase.SSA827_Status === undefined);

  // 4) advance to a denial → deadline computed
  await cases.advanceStage("u", kase.id, "Application filed", { fields: { SSA_Claim_Number: "123-45-6789", Application_Filed_Date: "2026-04-01" } });
  const denial = await cases.advanceStage("u", kase.id, "Initial decision denied", { fields: { Notice_Date: "2026-06-01" } });
  ok("denial computed deadline (notice+65, rolled)", denial.deadline === "2026-08-05");
  ok("Active_Deadline_Type = Reconsideration", db[kase.id].Active_Deadline_Type === "Reconsideration");

  // 5) calendar sync → one deadline event
  const calStore: Record<string, any> = {}; let g = 0;
  const cal = { async insert(_c: string, _e: any) { return "g" + (++g); }, async update() {}, async remove() {} };
  const links = { async get() { return { ...calStore }; }, async upsert(_c: string, k: string, id: string, sig: string) { calStore[k] = { eventId: id, sig }; }, async remove(_c: string, k: string) { delete calStore[k]; } };
  const calSync = createCalendarSyncService({ cal, links, calendarId: "CAL" });
  const r1 = await calSync.syncCase(db[kase.id], { caseId: kase.id, label: "Doe, Jane" });
  ok("calendar sync created the deadline event", r1.created === 1 && !!calStore[`deadline:${kase.id}`]);

  // 6) milestone email
  const emails: any[] = [];
  const notifier = createNotificationService({
    email: { async send(m: any) { emails.push(m); } },
    log: async () => {}, alreadySent: async () => false, queueDraft: async () => {}, now: NOW,
  });
  await notifier.notify({ caseId: kase.id, stage: "Hearing scheduled", recipient: { email: "jane@x.com" }, consent: {}, tokens: { first_name: "Jane", hearing_date: "Sept 10" } });
  ok("milestone email sent to client", emails.length === 1 && emails[0].to === "jane@x.com" && /Jane/.test(emails[0].body));

  console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
})();
