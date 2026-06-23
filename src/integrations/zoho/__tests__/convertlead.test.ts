// @ts-nocheck
import { createIntakeService } from "../intakeService";

const NOW = () => new Date(Date.UTC(2026, 5, 20));
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? "✓" : "✗"} ${l}`); c ? pass++ : fail++; };

function mockZoho(lead: Record<string, unknown> | null, coqlRows: any[] = []) {
  const calls: any[] = [];
  const api = {
    async getRecord(_m: string, _id: string) { return lead; },
    async coql(q: string) { calls.push({ op: "coql", q }); return coqlRows; },
    async createRecords(m: string, recs: any[]) {
      calls.push({ op: "create", m, rec: recs[0] });
      return [{ code: "SUCCESS", details: { id: m === "Contacts" ? "C1" : m === "Engagements" ? "E1" : "K1" } }];
    },
    async updateRecords(m: string, recs: any[]) { calls.push({ op: "update", m, recs }); return recs; },
    async deleteRecords() { return []; },
  };
  return { zoho: { as: () => api } as any, calls };
}

await (async () => {
  // ---- happy path: SSDI lead converts ----
  {
    const { zoho, calls } = mockZoho({
      First_Name: "Jane", Last_Name: "Doe", Email: "jane@example.com", Mobile: "555-1212",
      Phone: "555-0000", Lead_Source: "Guardian", Practice_Area: "SSDI",
      Street: "1 Main", City: "Irvine", State: "CA", Zip_Code: "92602", Lead_Status: "Qualified",
    });
    const svc = createIntakeService({ zoho, now: NOW });
    const res = await svc.convertLead("user1", "LEAD1");

    const contact = calls.find((c) => c.op === "create" && c.m === "Contacts").rec;
    ok("creates Contact from lead names", contact.First_Name === "Jane" && contact.Last_Name === "Doe");
    ok("maps Mobile + Home_Phone", contact.Mobile === "555-1212" && contact.Home_Phone === "555-0000");
    ok("maps mailing address", contact.Mailing_City === "Irvine" && contact.Mailing_Zip === "92602");
    ok("carries Lead_Source", contact.Lead_Source === "Guardian");

    const eng = calls.find((c) => c.op === "create" && c.m === "Engagements").rec;
    ok("creates SSDI engagement", eng.Engagement_Type === "SSDI" && eng.Retainer_Status === "Not Sent");
    ok("records conflict status", eng.Conflict_Check_Status === "Cleared");

    ok("no case created at conversion", !calls.some((c) => c.op === "create" && c.m === "SSDI_Cases"));

    const leadUpd = calls.find((c) => c.op === "update" && c.m === "Leads").recs[0];
    ok("stamps Lead_Status = Converted", leadUpd.Lead_Status === "Converted");
    ok("links Converted_Contact to new client", leadUpd.Converted_Contact.id === "C1");
    ok("returns ids + leadId", res.clientId === "C1" && res.engagementId === "E1" && res.leadId === "LEAD1");
  }

  // ---- conflict found is surfaced + recorded ----
  {
    const { zoho, calls } = mockZoho(
      { First_Name: "Bob", Last_Name: "Smith", Email: "bob@x.com", Practice_Area: "SSDI" },
      [{ id: "C9", Last_Name: "Smith" }], // existing contact → conflict
    );
    const svc = createIntakeService({ zoho, now: NOW });
    const res = await svc.convertLead("u", "LEAD2");
    ok("conflict detected", res.conflict.status === "Conflict found");
    ok("conflict recorded on engagement", calls.find((c) => c.op === "create" && c.m === "Engagements").rec.Conflict_Check_Status === "Conflict found");
  }

  // ---- non-SSDI practice is gated ----
  {
    const { zoho } = mockZoho({ First_Name: "A", Last_Name: "B", Practice_Area: "FCRA" });
    const svc = createIntakeService({ zoho, now: NOW });
    let threw = false;
    try { await svc.convertLead("u", "L3"); } catch (e) { threw = e instanceof Error && /only SSDI conversion is built/.test(e.message); }
    ok("FCRA lead conversion is gated with clear error", threw);
  }

  // ---- already-converted lead is blocked ----
  {
    const { zoho } = mockZoho({ Last_Name: "X", Practice_Area: "SSDI", Converted_Contact: { id: "C0" } });
    const svc = createIntakeService({ zoho, now: NOW });
    let threw = false;
    try { await svc.convertLead("u", "L4"); } catch (e) { threw = e instanceof Error && /already converted/.test(e.message); }
    ok("re-converting is blocked", threw);
  }

  // ---- missing last name guard ----
  {
    const { zoho } = mockZoho({ First_Name: "NoLast", Practice_Area: "SSDI" });
    const svc = createIntakeService({ zoho, now: NOW });
    let threw = false;
    try { await svc.convertLead("u", "L5"); } catch (e) { threw = e instanceof Error && /no last name/.test(e.message); }
    ok("missing last name guarded", threw);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
