// @ts-nocheck
import { createRetainerService, parseSignWebhook } from "../retainerService";
import { createSsdiCaseOpener } from "../intakeService";

const NOW = () => new Date(Date.UTC(2026, 5, 20)); // 2026-06-20
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? "✓" : "✗"} ${l}`); c ? pass++ : fail++; };

// ---- mock CRM client (per-actor + service share one api) ----
function mockZoho(records: Record<string, Record<string, unknown>>, coqlRows: any[] = []) {
  const calls: any[] = [];
  const api = {
    async getRecord(_m: string, id: string) { return records[id] ?? null; },
    async coql(q: string) { calls.push({ op: "coql", q }); return coqlRows; },
    async updateRecords(m: string, recs: any[]) { calls.push({ op: "update", m, recs }); return recs; },
    async createRecords(m: string, recs: any[]) { calls.push({ op: "create", m, recs }); return recs; },
    async deleteRecords() { return []; },
  };
  return { client: { as: () => api, service: () => api } as any, calls };
}

function mockSign(result = { requestId: "REQ-123", signLink: "https://sign/REQ-123" }) {
  const sent: any[] = [];
  const sign = { async sendTemplate(i: any) { sent.push(i); return result; } };
  return { sign, sent };
}

await (async () => {
  // ---- sendRetainer happy path ----
  {
    const { client, calls } = mockZoho({
      E1: { Name: "Doe, Jane — SSDI", Client: { id: "C1" }, Retainer_Status: "Not Sent" },
      C1: { First_Name: "Jane", Last_Name: "Doe", Email: "jane@example.com" },
    });
    const { sign, sent } = mockSign();
    const svc = createRetainerService({ zoho: client, sign, now: NOW });
    const res = await svc.sendRetainer("user1", "E1");

    ok("sign sent to client email", sent[0].recipient.email === "jane@example.com");
    ok("sign recipient full name", sent[0].recipient.name === "Jane Doe");
    ok("merge Client_Full_Name", sent[0].mergeData.Client_Full_Name === "Jane Doe");
    ok("merge Today_Date = 2026-06-20", sent[0].mergeData.Today_Date === "2026-06-20");
    ok("reference = engagement id", sent[0].reference === "E1");

    const upd = calls.find((c) => c.op === "update").recs[0];
    ok("engagement update has id", upd.id === "E1");
    ok("Retainer_ID persisted", upd.Retainer_ID === "REQ-123");
    ok("Retainer_Link persisted", upd.Retainer_Link === "https://sign/REQ-123");
    ok("Retainer_Status = Sent", upd.Retainer_Status === "Sent");
    ok("Retainer_Sent stamped (datetime)", upd.Retainer_Sent === "2026-06-20T00:00:00+00:00");
    ok("returns requestId", res.requestId === "REQ-123");
  }

  // ---- refuse resend when already Signed ----
  {
    const { client } = mockZoho({ E2: { Client: { id: "C1" }, Retainer_Status: "Signed" }, C1: { Email: "x@y.com" } });
    const { sign } = mockSign();
    const svc = createRetainerService({ zoho: client, sign, now: NOW });
    let threw = false;
    try { await svc.sendRetainer("u", "E2"); } catch { threw = true; }
    ok("does not resend a Signed retainer", threw);
  }

  // ---- missing email guard ----
  {
    const { client } = mockZoho({ E3: { Client: { id: "C9" }, Retainer_Status: "Not Sent" }, C9: { First_Name: "No", Last_Name: "Email" } });
    const { sign } = mockSign();
    const svc = createRetainerService({ zoho: client, sign, now: NOW });
    let threw = false;
    try { await svc.sendRetainer("u", "E3"); } catch { threw = true; }
    ok("guards missing client email", threw);
  }

  // ---- webhook → Signed ----
  {
    const { client, calls } = mockZoho({}, [{ id: "E1", Retainer_Status: "Sent" }]);
    const { sign } = mockSign();
    const svc = createRetainerService({ zoho: client, sign, now: NOW });
    const r = await svc.handleSignCompleted({ action_type: "RequestCompleted", requests: { request_id: "REQ-123" } });
    ok("webhook matched engagement", r?.engagementId === "E1");
    ok("webhook set Signed", r?.status === "Signed");
    const upd = calls.find((c) => c.op === "update").recs[0];
    ok("webhook stamps Retainer_Signed_Date", typeof upd.Retainer_Signed_Date === "string");
    const coql = calls.find((c) => c.op === "coql");
    ok("webhook joins on Retainer_ID", coql.q.includes("Retainer_ID = 'REQ-123'"));
  }

  // ---- webhook fires onRetainerSigned exactly on the transition to Signed ----
  {
    const { client } = mockZoho({}, [{ id: "E1", Retainer_Status: "Sent" }]);
    const { sign } = mockSign();
    const opened: any[] = [];
    const svc = createRetainerService({ zoho: client, sign, now: NOW, onRetainerSigned: async (c) => { opened.push(c); } });
    await svc.handleSignCompleted({ notifications: { operation_type: "RequestCompleted" }, requests: { request_id: "REQ-123" } });
    ok("onRetainerSigned called with engagementId", opened.length === 1 && opened[0].engagementId === "E1");
  }

  // ---- duplicate Signed webhook is a no-op (no re-open) ----
  {
    const { client, calls } = mockZoho({}, [{ id: "E1", Retainer_Status: "Signed" }]); // already signed
    const { sign } = mockSign();
    const opened: any[] = [];
    const svc = createRetainerService({ zoho: client, sign, now: NOW, onRetainerSigned: async (c) => { opened.push(c); } });
    const r = await svc.handleSignCompleted({ action_type: "RequestCompleted", requests: { request_id: "REQ-123" } });
    ok("duplicate Signed → null", r === null);
    ok("duplicate Signed → no update", !calls.some((c) => c.op === "update"));
    ok("duplicate Signed → hook not called", opened.length === 0);
  }

  // ---- createSsdiCaseOpener opens a case for an SSDI engagement when none exists ----
  {
    const calls: any[] = [];
    const api = {
      async getRecord(_m: string, _id: string) { return { Engagement_Type: "SSDI", Owner: { id: "U7" } }; },
      async coql(q: string) { calls.push({ op: "coql", q }); return []; }, // no existing case
      async createRecords(m: string, recs: any[]) { calls.push({ op: "create", m, rec: recs[0] }); return [{ details: { id: "K1" } }]; },
      async updateRecords() { return []; }, async deleteRecords() { return []; },
    };
    const zoho = { as: () => api } as any;
    const opener = createSsdiCaseOpener(zoho, { now: NOW });
    const res = await opener({ engagementId: "E1" });
    ok("opener creates SSDI_Cases", calls.some((c) => c.op === "create" && c.m === "SSDI_Cases"));
    const kase = calls.find((c) => c.op === "create").rec;
    ok("opened case at Retained, linked + assigned", kase.Current_Stage === "Retained" && kase.Engagement.id === "E1" && kase.Assigned_Case_Manager.id === "U7");
    ok("opener COQL filters lookup by bare id", calls.find((c) => c.op === "coql").q.includes("Engagement = E1"));
    ok("opener returns caseId", res.caseId === "K1");
  }

  // ---- opener is idempotent (existing case → no create) ----
  {
    const calls: any[] = [];
    const api = {
      async getRecord() { return { Engagement_Type: "SSDI", Owner: { id: "U7" } }; },
      async coql() { return [{ id: "K9" }]; }, // a case already exists
      async createRecords(m: string, recs: any[]) { calls.push({ op: "create", m }); return [{ details: { id: "NEW" } }]; },
      async updateRecords() { return []; }, async deleteRecords() { return []; },
    };
    const opener = createSsdiCaseOpener({ as: () => api } as any, { now: NOW });
    const res = await opener({ engagementId: "E1" });
    ok("opener skips when a case exists", !calls.some((c) => c.op === "create"));
    ok("opener returns existing caseId", res.caseId === "K9");
  }

  // ---- opener skips non-SSDI engagements ----
  {
    const calls: any[] = [];
    const api = {
      async getRecord() { return { Engagement_Type: "FDCPA", Owner: { id: "U7" } }; },
      async coql() { calls.push("coql"); return []; },
      async createRecords(m: string) { calls.push("create"); return [{ details: { id: "X" } }]; },
      async updateRecords() { return []; }, async deleteRecords() { return []; },
    };
    const opener = createSsdiCaseOpener({ as: () => api } as any, { now: NOW });
    const res = await opener({ engagementId: "E1" });
    ok("opener no-ops for non-SSDI", calls.length === 0 && res.caseId === undefined);
  }

  // ---- webhook unknown request → no-op ----
  {
    const { client } = mockZoho({}, []);
    const { sign } = mockSign();
    const svc = createRetainerService({ zoho: client, sign, now: NOW });
    const r = await svc.handleSignCompleted({ action_type: "RequestCompleted", requests: { request_id: "NOPE" } });
    ok("no matching engagement → null", r === null);
  }

  // ---- real Zoho Sign payload shape (notifications.operation_type) ----
  {
    const { client, calls } = mockZoho({}, [{ id: "E1", Retainer_Status: "Sent" }]);
    const { sign } = mockSign();
    const svc = createRetainerService({ zoho: client, sign, now: NOW });
    const r = await svc.handleSignCompleted({
      requests: { request_id: "REQ-123", request_name: "Gator retainer" },
      notifications: { operation_type: "RequestCompleted" },
    });
    ok("real-shape webhook matched + Signed", r?.engagementId === "E1" && r?.status === "Signed");
    const _ = calls; // silence unused
  }

  // ---- parseSignWebhook variants ----
  ok("parse: complete → Signed", parseSignWebhook({ action_type: "RequestCompleted", requests: { request_id: "R" } })?.status === "Signed");
  ok("parse: notifications.operation_type complete → Signed", parseSignWebhook({ notifications: { operation_type: "RequestCompleted" }, requests: { request_id: "R" } })?.status === "Signed");
  ok("parse: signing success + completed status → Signed", parseSignWebhook({ notifications: { operation_type: "RequestSigningSuccess" }, requests: { request_id: "R", request_status: "completed" } })?.status === "Signed");
  ok("parse: declined → Declined", parseSignWebhook({ action_type: "RequestRejected? declined", requests: { request_id: "R" } })?.status === "Declined");
  ok("parse: expired → Expired", parseSignWebhook({ requests: { request_id: "R", request_status: "expired" } })?.status === "Expired");
  ok("parse: viewed → undefined status", parseSignWebhook({ action_type: "viewed", requests: { request_id: "R" } })?.status === undefined);
  ok("parse: garbage → null", parseSignWebhook({}) === null);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
