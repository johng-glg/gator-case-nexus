// @ts-nocheck
import { messagesForStage, messageForEvent, planDelivery, type ConsentRecord } from "../messagingService";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? "✓" : "✗"} ${l}`); c ? pass++ : fail++; };

// fixed clocks in Pacific: 2pm (within window) and 11pm (quiet hours)
const TWO_PM = new Date("2026-06-20T21:00:00Z");  // 14:00 PDT
const ELEVEN_PM = new Date("2026-06-21T06:00:00Z"); // 23:00 PDT (prev day)
const TZ = "America/Los_Angeles";

await (async () => {
  // stage → messages
  ok("hearing scheduled notifies (routine)", messagesForStage("Hearing scheduled")[0].sensitivity === "routine");
  ok("award notifies (routine)", messagesForStage("Award / NOA received").length === 1);
  ok("application filed notifies", messagesForStage("Application filed").length === 1);
  ok("a denial is adverse", messagesForStage("ALJ decision denied")[0].sensitivity === "adverse");
  ok("non-notifying stage is silent", messagesForStage("Reconsideration filed").length === 0);
  ok("event: documents-received routine", messageForEvent("documents-received")?.sensitivity === "routine");

  const routine = messagesForStage("Hearing scheduled")[0];
  const adverse = messagesForStage("ALJ decision denied")[0];

  // adverse always held, no channels, regardless of consent
  const full: ConsentRecord = { sms: { optIn: true } };
  let p = planDelivery(adverse, full, TWO_PM, TZ);
  ok("adverse → hold review", p.hold === "review");
  ok("adverse → no channels", p.channels.length === 0);

  // routine + email default-on, no sms consent → email only
  p = planDelivery(routine, {}, TWO_PM, TZ);
  ok("routine email on by default", p.channels.includes("email"));
  ok("no sms without opt-in", !p.channels.includes("sms"));

  // routine + sms opt-in, within window → email + sms, no defer
  p = planDelivery(routine, { sms: { optIn: true } }, TWO_PM, TZ);
  ok("sms sent with opt-in in-window", p.channels.includes("sms") && !p.deferUntil);

  // routine + sms opt-in but quiet hours → sms deferred
  p = planDelivery(routine, { sms: { optIn: true } }, ELEVEN_PM, TZ);
  ok("sms deferred during quiet hours", p.channels.includes("sms") && typeof p.deferUntil === "string");

  // email opt-out suppresses email
  p = planDelivery(routine, { email: { optedOutAt: "2026-01-01" }, sms: { optIn: true } }, TWO_PM, TZ);
  ok("email opt-out suppresses email", !p.channels.includes("email") && p.channels.includes("sms"));

  // sms opted out suppresses sms even with prior opt-in
  p = planDelivery(routine, { sms: { optIn: true, optedOutAt: "2026-02-02" } }, TWO_PM, TZ);
  ok("sms opt-out beats opt-in", !p.channels.includes("sms"));

  // no consenting channel at all
  p = planDelivery(routine, { email: { optedOutAt: "x" } }, TWO_PM, TZ);
  ok("no channels → reason set", p.channels.length === 0 && p.reason === "no consenting channel");

  console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
})();
