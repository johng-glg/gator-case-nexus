// @ts-nocheck
import { createCaseService } from "../caseService";
const NOW = () => new Date(Date.UTC(2026, 5, 20));
let captured: any = null;
const api = {
  async getRecord() { return { Active_Deadline_Type: "Reconsideration", Notice_Date: "2026-06-25",
    Documented_Receipt_Date: null, Deadline_Date: "2026-08-24", Days_To_Deadline: 64, Deadline_At_Risk: false }; },
  async updateRecords(_m: string, recs: any[]) { captured = recs[0]; return recs; },
  async createRecords() { return []; }, async coql() { return []; }, async deleteRecords() { return []; },
};
const zoho = { as: () => api, service: () => api } as any;
const svc = createCaseService({ zoho, now: NOW });
const out = await svc.recomputeDeadline("u", "C1");
const ok = (l: string, c: boolean) => console.log(`${c ? "✓" : "✗"} ${l}`);
// 06-25 +5 +60 = 08-29 (Sat) -> rolls to Mon 08-31
ok("recomputed deadline 2026-06-25 -> 2026-08-31", captured.Deadline_Date === "2026-08-31");
ok("days recounted from 2026-06-20", captured.Days_To_Deadline === 72);
ok("returns the updates", out.Deadline_Date === "2026-08-31");
