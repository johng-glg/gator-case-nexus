/**
 * notificationService.ts — client status notifications (email-first), TCPA-safe.
 *
 * Wires the messaging decision engine (messagesForStage / messageForEvent / planDelivery) to an
 * email transport. This phase is EMAIL ONLY — SMS is deferred (no provider yet); the engine already
 * gates SMS behind written opt-in, so when SMS is added later it's additive (Phase 2b).
 *
 * Guarantees:
 *   - Adverse outcomes (denials) are NEVER auto-sent → queued for attorney review.
 *   - De-dupe: a message key already sent for a case is skipped (re-entered stage won't double-send).
 *   - Email honored only when not opted out (planDelivery decides); everything is logged for audit.
 */

import { messagesForStage, messageForEvent, planDelivery, type MessageSpec, type ConsentRecord } from "./messagingService";

export interface EmailAdapter {
  send(msg: { to: string; subject: string; body: string }): Promise<void>;
}

export interface NotificationDeps {
  email: EmailAdapter;
  /** Write an audit entry (ties into case_activity_log). */
  log: (caseId: string, action: string, meta: Record<string, unknown>) => Promise<void>;
  /** Has this message key already been sent for this case? (check the activity log) */
  alreadySent: (caseId: string, key: string) => Promise<boolean>;
  /** Queue an adverse message as a draft for an attorney to send personally. */
  queueDraft: (caseId: string, msg: MessageSpec) => Promise<void>;
  now?: () => Date;
  tz?: string;
}

const fill = (t: string, tokens: Record<string, string>) =>
  t.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => tokens[k] ?? "");

export function createNotificationService(deps: NotificationDeps) {
  const now = () => (deps.now ? deps.now() : new Date());

  /**
   * Fire the message(s) for a stage entry or an event. Returns what it did per message
   * (sent / held / skipped) for logging/UI.
   */
  async function notify(input: {
    caseId: string;
    stage?: string;
    event?: string;
    recipient: { email?: string };
    consent: ConsentRecord;
    tokens: Record<string, string>;
  }): Promise<Array<{ key: string; action: string; channel?: string; reason?: string }>> {
    const specs: MessageSpec[] = input.stage
      ? messagesForStage(input.stage)
      : input.event
        ? ([messageForEvent(input.event)].filter(Boolean) as MessageSpec[])
        : [];

    const results: Array<{ key: string; action: string; channel?: string; reason?: string }> = [];

    for (const msg of specs) {
      if (await deps.alreadySent(input.caseId, msg.key)) {
        results.push({ key: msg.key, action: "skipped-duplicate" });
        continue;
      }

      const plan = planDelivery(msg, input.consent, now(), deps.tz);

      if (plan.hold === "review") {
        await deps.queueDraft(input.caseId, msg);
        await deps.log(input.caseId, "message_held_for_review", { key: msg.key, reason: plan.reason });
        results.push({ key: msg.key, action: "held" });
        continue;
      }

      // EMAIL-FIRST: only the email channel is actioned this phase. (SMS, if planned, waits for 2b.)
      if (plan.channels.includes("email") && input.recipient.email) {
        await deps.email.send({
          to: input.recipient.email,
          subject: fill(msg.subject, input.tokens),
          body: fill(msg.template, input.tokens),
        });
        await deps.log(input.caseId, "message_sent", { key: msg.key, channel: "email" });
        results.push({ key: msg.key, action: "sent", channel: "email" });
      } else {
        await deps.log(input.caseId, "message_skipped", { key: msg.key, reason: plan.reason ?? "no email channel" });
        results.push({ key: msg.key, action: "skipped", reason: plan.reason });
      }
    }
    return results;
  }

  return { notify };
}
