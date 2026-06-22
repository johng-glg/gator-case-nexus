/**
 * messagingService.ts — TCPA-safe client status messaging (Gator Law).
 *
 * Pure decision logic (no I/O). Two questions:
 *   1. messagesForStage(stage) — which client message(s), if any, a stage entry should trigger.
 *   2. planDelivery(msg, consent, now, tz) — given the client's consent + the clock, decide the
 *      channels to send on, whether to HOLD for attorney review, and whether to DEFER (SMS quiet
 *      hours). The app sends nothing this function didn't approve.
 *
 * Compliance stance (this firm litigates TCPA — get this right):
 *   - SMS requires prior express WRITTEN consent (smsConsent.optIn) AND no opt-out. Outside the
 *     8am–9pm local quiet-hours window, SMS is deferred to the next 8am, never dropped silently.
 *   - Email to one's own client about their case is transactional (existing business relationship),
 *     so it's allowed by default but still suppressed on opt-out (CAN-SPAM honor of unsubscribe).
 *   - ADVERSE news (any denial) is NEVER auto-sent on any channel — it returns hold:"review" so an
 *     attorney sends it personally. Approvals / scheduling / receipts are safe to automate.
 *   - Record consent PROOF (when, how, exact language) — see ConsentRecord — not just a boolean.
 */

export type Channel = "email" | "sms";
export type Sensitivity = "routine" | "adverse";

export interface MessageSpec {
  key: string;                 // stable id for de-dupe + audit, e.g. "stage:hearing-scheduled"
  sensitivity: Sensitivity;
  subject: string;
  /** Template body with {{tokens}} the app fills from the case (e.g. {{hearing_date}}). */
  template: string;
}

/** One channel's consent + proof. optIn=explicit grant; we also store how/when/what was shown. */
export interface ChannelConsent {
  optIn?: boolean;             // SMS: must be true to send. Email: treated as opt-OUT flag (see below).
  optedOutAt?: string;         // if set, channel is suppressed regardless of optIn
  capturedAt?: string;         // when consent/opt-out was recorded
  source?: string;             // e.g. "portal checkbox", "retainer §x", "inbound STOP"
  consentText?: string;        // exact language shown at capture (proof)
}

export interface ConsentRecord {
  email?: ChannelConsent;      // email is on by default; only optedOutAt suppresses it
  sms?: ChannelConsent;        // sms is off by default; needs optIn=true and no optedOutAt
}

export interface DeliveryPlan {
  channels: Channel[];         // channels cleared to send on now
  hold: "review" | null;       // "review" => do not auto-send; queue a draft for an attorney
  deferUntil?: string;         // ISO time to retry (SMS quiet-hours); applies to deferred channels
  reason?: string;             // human-readable why (for the activity log)
}

/** Stage-entry → client messages. Only the listed stages notify; everything else is silent. */
export function messagesForStage(stage: string): MessageSpec[] {
  switch (stage) {
    case "Application filed":
      return [{ key: "stage:application-filed", sensitivity: "routine",
        subject: "Your Social Security disability application was filed",
        template: "Hi {{first_name}}, we filed your disability application with the SSA. We'll keep you posted at each step." }];
    case "Hearing scheduled":
      return [{ key: "stage:hearing-scheduled", sensitivity: "routine",
        subject: "Your hearing has been scheduled",
        template: "Hi {{first_name}}, your hearing is scheduled for {{hearing_date}}{{hearing_office}}. We'll prepare you well before then." }];
    case "Award / NOA received":
      return [{ key: "stage:award", sensitivity: "routine",
        subject: "Good news about your Social Security case",
        template: "Hi {{first_name}}, we received a favorable decision in your case. We'll call you with the details." }];
    case "Initial decision denied":
    case "Recon decision denied":
    case "ALJ decision denied":
    case "AC decision denied":
      // adverse — never auto-send; an attorney delivers this personally.
      return [{ key: `stage:${stage}`, sensitivity: "adverse",
        subject: "Update on your Social Security case",
        template: "DRAFT — attorney to review before sending. {{first_name}}'s {{stage}} requires a personal call/letter about next-tier options and the appeal deadline ({{deadline_date}})." }];
    default:
      return [];
  }
}

/** Non-stage events (e.g. the document-request flow) can also message; kept here for one source. */
export function messageForEvent(event: string): MessageSpec | null {
  switch (event) {
    case "documents-received":
      return { key: "event:documents-received", sensitivity: "routine",
        subject: "We received your documents",
        template: "Hi {{first_name}}, we received the documents you uploaded — thank you. No action needed right now." };
    case "documents-requested":
      return { key: "event:documents-requested", sensitivity: "routine",
        subject: "Please upload a few documents for your case",
        template: "Hi {{first_name}}, we need a few documents to move your case forward. Use this secure link: {{upload_link}}" };
    default:
      return null;
  }
}

const HHmm = (iso: string, tz: string): number => {
  // minutes-since-midnight in the client's tz
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
};

const QUIET_START = 21 * 60; // 9:00 pm
const QUIET_END = 8 * 60;    // 8:00 am

/** Next 8:00am in tz, as ISO, for deferring an SMS that lands in quiet hours. */
function nextEightAM(nowIso: string, tz: string): string {
  const now = new Date(nowIso);
  for (let i = 0; i <= 1; i++) {
    const d = new Date(now.getTime() + i * 86_400_000);
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const candidate = new Date(`${ymd}T08:00:00`);
    // crude tz-naive 8am; good enough to schedule "next morning". The sender re-checks the window.
    if (i === 1 || HHmm(nowIso, tz) < QUIET_END) return candidate.toISOString();
  }
  return new Date(now.getTime() + 12 * 3600_000).toISOString();
}

/**
 * Decide how to deliver a message given consent + the clock.
 * Adverse → always hold for review. Routine → email unless opted out; SMS only with opt-in,
 * suppressed on opt-out, and deferred outside quiet hours.
 */
export function planDelivery(
  msg: MessageSpec,
  consent: ConsentRecord,
  now: Date = new Date(),
  tz = "America/Los_Angeles",
): DeliveryPlan {
  if (msg.sensitivity === "adverse") {
    return { channels: [], hold: "review", reason: "Adverse outcome — attorney must send personally" };
  }

  const channels: Channel[] = [];
  let deferUntil: string | undefined;
  const notes: string[] = [];

  // Email: transactional, on by default; suppress only on explicit opt-out.
  if (!consent.email?.optedOutAt) channels.push("email");
  else notes.push("email opted out");

  // SMS: requires explicit opt-in, no opt-out, and within quiet-hours window.
  const sms = consent.sms;
  if (sms?.optIn && !sms.optedOutAt) {
    const mins = HHmm(now.toISOString(), tz);
    const inQuiet = mins >= QUIET_START || mins < QUIET_END;
    if (inQuiet) { deferUntil = nextEightAM(now.toISOString(), tz); notes.push("sms deferred (quiet hours)"); }
    channels.push("sms");
  } else {
    notes.push(sms?.optedOutAt ? "sms opted out" : "no sms consent");
  }

  return {
    channels,
    hold: null,
    deferUntil,
    reason: channels.length ? notes.join("; ") || undefined : "no consenting channel",
  };
}
