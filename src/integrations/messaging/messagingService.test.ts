import { planDelivery, triggerKey, MILESTONE_KEYS } from "./messagingService";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? "✓" : "✗"} ${l}`); c ? pass++ : fail++; };

const allMilestones = [...MILESTONE_KEYS];
const baseSettings = { enabledMilestones: allMilestones };
const consentOk = { emailOptedOutAt: null, emailHardSuppressed: false };
const caseLabel = "SSDI-001";

// 1. Known stage with no copy → skip("no-template")
ok("unknown/internal stage → skip no-template", planDelivery({
  trigger: { kind: "stage", stage: "Fee petition filed" },
  consent: consentOk, settings: baseSettings, alreadyHandled: false, caseLabel,
}).op === "skip");

// 2. Documents requested → send email
const a = planDelivery({
  trigger: { kind: "event", event: "documents-requested" },
  consent: consentOk, settings: baseSettings, alreadyHandled: false, caseLabel,
});
ok("docs-requested → send email", a.op === "send" && a.channel === "email");
ok("msgKey is event:documents-requested", a.msgKey === "event:documents-requested");

// 3. Denial → hold for review
const d = planDelivery({
  trigger: { kind: "stage", stage: "Recon decision denied" },
  consent: consentOk, settings: baseSettings, alreadyHandled: false, caseLabel,
});
ok("denial → hold(adverse-outcome)", d.op === "hold" && d.reason === "adverse-outcome");

// 4. Opted out → skip
const e = planDelivery({
  trigger: { kind: "stage", stage: "Application filed" },
  consent: { emailOptedOutAt: "2026-01-01T00:00:00Z" }, settings: baseSettings, alreadyHandled: false, caseLabel,
});
ok("opt-out → skip(email-opted-out)", e.op === "skip" && e.reason === "email-opted-out");

// 5. Hard suppressed beats opt-out
const f = planDelivery({
  trigger: { kind: "stage", stage: "Application filed" },
  consent: { emailHardSuppressed: true }, settings: baseSettings, alreadyHandled: false, caseLabel,
});
ok("suppressed → skip(email-suppressed)", f.op === "skip" && f.reason === "email-suppressed");

// 6. Milestone disabled → skip (but adverse still holds)
const g = planDelivery({
  trigger: { kind: "stage", stage: "Application filed" },
  consent: consentOk, settings: { enabledMilestones: [] }, alreadyHandled: false, caseLabel,
});
ok("disabled milestone → skip(milestone-disabled)", g.op === "skip" && g.reason === "milestone-disabled");

const h = planDelivery({
  trigger: { kind: "stage", stage: "ALJ decision denied" },
  consent: consentOk, settings: { enabledMilestones: [] }, alreadyHandled: false, caseLabel,
});
ok("disabled milestone but adverse → still hold", h.op === "hold");

// 7. Duplicate → skip
const i = planDelivery({
  trigger: { kind: "stage", stage: "Application filed" },
  consent: consentOk, settings: baseSettings, alreadyHandled: true, caseLabel,
});
ok("alreadyHandled → skip(duplicate)", i.op === "skip" && i.reason === "duplicate");

// 8. Hearing scheduled → send (carries CTA when portal URL provided)
const j = planDelivery({
  trigger: { kind: "stage", stage: "Hearing scheduled" },
  consent: consentOk, settings: baseSettings, alreadyHandled: false, caseLabel,
  portalUrl: "https://app.example/portal",
});
ok("hearing scheduled → send with CTA", j.op === "send" && j.copy.ctaUrl === "https://app.example/portal");

// 9. triggerKey
ok("triggerKey(event)", triggerKey({ kind: "event", event: "documents-received" }) === "event:documents-received");
ok("triggerKey(stage)", triggerKey({ kind: "stage", stage: "Application filed" }) === "stage:Application filed");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
