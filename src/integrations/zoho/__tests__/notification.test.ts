// @ts-nocheck
import { createNotificationService } from "../notificationService";
import type { ConsentRecord } from "../messagingService";
const NOW = () => new Date("2026-06-20T21:00:00Z"); // 2pm PDT (in window)
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? "✓" : "✗"} ${l}`); c ? pass++ : fail++; };

function mocks(sentKeys: string[] = []) {
  const emails: any[] = [], logs: any[] = [], drafts: any[] = [];
  const deps = {
    email: { async send(m: any) { emails.push(m); } },
    async log(caseId: string, action: string, meta: any) { logs.push({ caseId, action, meta }); },
    async alreadySent(_c: string, key: string) { return sentKeys.includes(key); },
    async queueDraft(caseId: string, msg: any) { drafts.push({ caseId, key: msg.key }); },
    now: NOW, tz: "America/Los_Angeles",
  };
  return { deps, emails, logs, drafts };
}
const ctx = { recipient: { email: "jane@x.com" }, consent: {} as ConsentRecord, tokens: { first_name: "Jane", hearing_date: "Sept 10" } };

await (async () => {
  // routine stage → email sent + logged
  {
    const m = mocks();
    const r = await createNotificationService(m.deps).notify({ caseId: "K1", stage: "Hearing scheduled", ...ctx });
    ok("routine → email sent", m.emails.length === 1 && m.emails[0].to === "jane@x.com");
    ok("token filled in body", m.emails[0].body.includes("Jane") && m.emails[0].body.includes("Sept 10"));
    ok("logged message_sent", m.logs.some((l) => l.action === "message_sent"));
    ok("result = sent/email", r[0].action === "sent" && r[0].channel === "email");
  }
  // adverse (denial) → held, NOT sent
  {
    const m = mocks();
    const r = await createNotificationService(m.deps).notify({ caseId: "K1", stage: "ALJ decision denied", ...ctx });
    ok("adverse → not emailed", m.emails.length === 0);
    ok("adverse → queued for review", m.drafts.length === 1);
    ok("adverse → result held", r[0].action === "held");
  }
  // duplicate → skipped
  {
    const m = mocks(["stage:hearing-scheduled"]);
    const r = await createNotificationService(m.deps).notify({ caseId: "K1", stage: "Hearing scheduled", ...ctx });
    ok("duplicate → not re-sent", m.emails.length === 0 && r[0].action === "skipped-duplicate");
  }
  // email opted out → skipped
  {
    const m = mocks();
    const r = await createNotificationService(m.deps).notify({ caseId: "K1", stage: "Hearing scheduled", recipient: { email: "jane@x.com" }, consent: { email: { optedOutAt: "2026-01-01" } }, tokens: {} });
    ok("email opt-out → not sent", m.emails.length === 0 && r[0].action === "skipped");
  }
  // event message (documents received)
  {
    const m = mocks();
    await createNotificationService(m.deps).notify({ caseId: "K1", event: "documents-received", ...ctx });
    ok("event message emails", m.emails.length === 1 && /received/i.test(m.emails[0].subject));
  }
  // non-notifying stage → nothing
  {
    const m = mocks();
    const r = await createNotificationService(m.deps).notify({ caseId: "K1", stage: "Reconsideration filed", ...ctx });
    ok("silent stage → no messages", r.length === 0 && m.emails.length === 0);
  }
  console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
})();
