import { createFormsService, gatorIntakeForms } from "./formsService";

const NOW = () => new Date(Date.UTC(2026, 5, 20)); // 2026-06-20
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? "✓" : "✗"} ${l}`); c ? pass++ : fail++; };

const FORMS = gatorIntakeForms({
  ssa1696TemplateId: "T1696", ssa1696ActionId: "A1696",
  ssa827TemplateId: "T827", ssa827ActionId: "A827",
});

// mock CRM: case→eng→client chain + capture writes
function mockZoho(records: Record<string, Record<string, unknown>>, coqlRows: any[] = []) {
  const calls: any[] = [];
  const api = {
    async getRecord(m: string, id: string) { return records[id] ?? null; },
    async coql(q: string) { calls.push({ op: "coql", q }); return coqlRows; },
    async updateRecords(m: string, recs: any[]) { calls.push({ op: "update", m, recs }); return recs; },
    async createRecords(m: string, recs: any[]) { calls.push({ op: "create", m, recs }); return recs; },
    async deleteRecords() { return []; },
  };
  return { zoho: { as: () => api } as any, calls };
}
function mockSign() {
  const sent: any[] = [];
  let n = 0;
  const sign = { async sendTemplate(i: any) { sent.push(i); return { requestId: "REQ" + (++n), signLink: "https://s/" + n }; } };
  return { sign, sent };
}

await (async () => {
  // ---- sendIntakeForms only auto-sends SSA-1696 (827 is manual + needs attestation) ----
  {
    const { zoho, calls } = mockZoho({
      K1: { Engagement: { id: "E1" }, SSA1696_Status: "Not sent", SSA827_Status: "Not sent" },
      E1: { Client: { id: "C1" } },
      C1: { First_Name: "Jane", Last_Name: "Doe", Email: "jane@x.com" },
    });
    const { sign, sent } = mockSign();
    const svc = createFormsService({ zoho, sign, forms: FORMS, now: NOW });
    const res = await svc.sendIntakeForms("u", "K1");

    ok("onIntake sends only SSA-1696", res.length === 1 && res[0].code === "SSA-1696");
    ok("1696 used its template + action", sent.find((s) => s.templateId === "T1696" && s.actionId === "A1696"));
    ok("827 NOT auto-sent on intake", !sent.find((s) => s.templateId === "T827"));
    ok("signer resolved via case→eng→client", sent[0].recipient.email === "jane@x.com" && sent[0].recipient.name === "Jane Doe");

    const upd1696 = calls.find((c) => c.op === "update" && c.recs[0].SSA1696_Status)?.recs[0];
    ok("1696 case stamped Sent + request id + sent date", upd1696.SSA1696_Status === "Sent" && upd1696.SSA1696_Request_ID?.startsWith("REQ") && upd1696.SSA1696_Sent_Date === "2026-06-20");
  }

  // ---- SSA-827 manual send requires attested=true ----
  {
    const { zoho } = mockZoho({
      K1: { Engagement: { id: "E1" }, SSA827_Status: "Not sent" },
      E1: { Client: { id: "C1" } },
      C1: { First_Name: "Jane", Last_Name: "Doe", Email: "jane@x.com" },
    });
    const { sign } = mockSign();
    const svc = createFormsService({ zoho, sign, forms: FORMS, now: NOW });
    let threw = false;
    try { await svc.sendForm("u", "K1", "SSA-827"); } catch { threw = true; }
    ok("SSA-827 rejected without attestation", threw);
    const r = await svc.sendForm("u", "K1", "SSA-827", { attested: true });
    ok("SSA-827 accepted with attestation", r.code === "SSA-827");
  }

  // ---- refuse to resend a signed form ----
  {
    const { zoho } = mockZoho({ K2: { SSA1696_Status: "Signed", Engagement: { id: "E1" } }, E1: { Client: { id: "C1" } }, C1: { Email: "x@y.com" } });
    const { sign } = mockSign();
    const svc = createFormsService({ zoho, sign, forms: FORMS, now: NOW });
    let threw = false;
    try { await svc.sendForm("u", "K2", "SSA-1696"); } catch { threw = true; }
    ok("does not resend a signed form", threw);
  }

  // ---- webhook: SSA-1696 signed → status Signed + datetime ----
  {
    const { zoho, calls } = mockZoho({}, [{ id: "K1", SSA1696_Request_ID: "REQ1", SSA827_Request_ID: "REQ2", SSA1696_Status: "Sent", SSA827_Status: "Sent" }]);
    const { sign } = mockSign();
    const svc = createFormsService({ zoho, sign, forms: FORMS, now: NOW });
    const r = await svc.handleFormSigned({ notifications: { operation_type: "RequestCompleted" }, requests: { request_id: "REQ1" } });
    ok("webhook identifies SSA-1696 by request id", r?.code === "SSA-1696" && r?.status === "Signed");
    const upd = calls.find((c) => c.op === "update").recs[0];
    ok("1696 signed stamps SSA1696_Signed_Date (datetime)", typeof upd.SSA1696_Signed_Date === "string" && upd.SSA1696_Signed_Date.includes("T"));
    ok("webhook COQL ORs both request-id fields", calls.find((c) => c.op === "coql").q.includes("SSA1696_Request_ID = 'REQ1'") && calls.find((c) => c.op === "coql").q.includes("SSA827_Request_ID = 'REQ1'"));
  }

  // ---- webhook: SSA-827 signed → Release_Signed_Date as DATE (feeds release sweep) ----
  {
    const { zoho, calls } = mockZoho({}, [{ id: "K1", SSA1696_Request_ID: "REQ1", SSA827_Request_ID: "REQ2", SSA827_Status: "Sent" }]);
    const { sign } = mockSign();
    const svc = createFormsService({ zoho, sign, forms: FORMS, now: NOW });
    const r = await svc.handleFormSigned({ action_type: "RequestCompleted", requests: { request_id: "REQ2" } });
    ok("webhook identifies SSA-827", r?.code === "SSA-827");
    const upd = calls.find((c) => c.op === "update").recs[0];
    ok("827 signed → Release_Signed_Date date-only", upd.Release_Signed_Date === "2026-06-20");
    ok("827 signed → SSA827_Status Signed", upd.SSA827_Status === "Signed");
  }

  // ---- webhook idempotency ----
  {
    const { zoho, calls } = mockZoho({}, [{ id: "K1", SSA1696_Request_ID: "REQ1", SSA1696_Status: "Signed" }]);
    const { sign } = mockSign();
    const svc = createFormsService({ zoho, sign, forms: FORMS, now: NOW });
    const r = await svc.handleFormSigned({ action_type: "RequestCompleted", requests: { request_id: "REQ1" } });
    ok("duplicate signed webhook → null", r === null);
    ok("duplicate → no update", !calls.some((c) => c.op === "update"));
  }

  // ---- unknown request id → no-op ----
  {
    const { zoho } = mockZoho({}, []);
    const { sign } = mockSign();
    const svc = createFormsService({ zoho, sign, forms: FORMS, now: NOW });
    ok("unknown request id → null", (await svc.handleFormSigned({ action_type: "RequestCompleted", requests: { request_id: "NOPE" } })) === null);
  }

  console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
})();
