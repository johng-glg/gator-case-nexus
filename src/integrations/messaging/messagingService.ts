/**
 * messagingService.ts — Pure engine for client messaging.
 *
 * Decides what to do with a notification trigger:
 *   - "send"    : send immediately on the channel
 *   - "hold"    : queue for attorney review (adverse outcomes, etc.)
 *   - "skip"    : do nothing (suppressed / opted-out / milestone disabled)
 *
 * No I/O. The orchestrator in `notifyService.server.ts` performs the I/O.
 */

import type { Stage } from "@/integrations/zoho/lifecycle";

/** Stable trigger identifier — also forms the dedupe key. */
export type Trigger =
  | { kind: "stage"; stage: Stage }
  | { kind: "event"; event: "documents-requested" | "documents-received" };

export interface ConsentSnapshot {
  /** ISO string when the client opted OUT of email. null/undefined = still opted in. */
  emailOptedOutAt?: string | null;
  /** Hard suppression from bounces/complaints — applies even if opted-in. */
  emailHardSuppressed?: boolean;
}

export interface MessagingSettingsSnapshot {
  /** Milestone keys enabled for auto-send. See `MILESTONE_KEYS` below. */
  enabledMilestones: string[];
}

export interface PlanContext {
  trigger: Trigger;
  consent: ConsentSnapshot;
  settings: MessagingSettingsSnapshot;
  /** Whether a message with this dedupe key has already been sent/held. */
  alreadyHandled: boolean;
}

export type PlanAction =
  | { op: "send"; channel: "email"; msgKey: string; copy: MessageCopy }
  | { op: "hold"; reason: "adverse-outcome"; msgKey: string; copy: MessageCopy }
  | { op: "skip"; reason: SkipReason; msgKey: string };

export type SkipReason =
  | "no-template"
  | "milestone-disabled"
  | "email-opted-out"
  | "email-suppressed"
  | "duplicate"
  | "unknown-trigger";

export interface MessageCopy {
  subject: string;
  /** Plain-text body (one or more paragraphs separated by blank lines). */
  body: string;
  /** Optional CTA. */
  ctaLabel?: string;
  ctaUrl?: string;
}

/** Stable, human-readable milestone keys exposed in the admin Settings UI. */
export const MILESTONE_KEYS = [
  "stage:Application filed",
  "stage:Hearing scheduled",
  "stage:Award / NOA received",
  "stage:Initial decision approved",
  "stage:Recon decision approved",
  "stage:ALJ decision approved",
  "event:documents-requested",
  "event:documents-received",
] as const;

/** Denial stages: never auto-send; always queue for attorney review. */
const ADVERSE_STAGES = new Set<Stage>([
  "Initial decision denied",
  "Recon decision denied",
  "ALJ decision denied",
  "AC decision denied",
]);

/** Compute the milestone key for a trigger. */
export function triggerKey(t: Trigger): string {
  return t.kind === "stage" ? `stage:${t.stage}` : `event:${t.event}`;
}

/**
 * Returns the message copy for a known trigger, or null when this trigger has
 * no client-facing message (most "internal" stages like *pending* don't notify).
 */
export function copyForTrigger(t: Trigger, ctx: { caseLabel: string; portalUrl?: string }): MessageCopy | null {
  const cta = ctx.portalUrl
    ? { ctaLabel: "View your case", ctaUrl: ctx.portalUrl }
    : {};
  if (t.kind === "event") {
    if (t.event === "documents-requested") {
      return {
        subject: `Action needed on your case — ${ctx.caseLabel}`,
        body:
          "Your attorney has requested additional documents for your case. " +
          "Please sign in to the client portal to see what's needed and upload your files.",
        ...cta,
      };
    }
    if (t.event === "documents-received") {
      return {
        subject: `We received your documents — ${ctx.caseLabel}`,
        body:
          "Thank you — your documents were received and have been added to your case file. " +
          "Your attorney will review them and follow up if anything else is needed.",
        ...cta,
      };
    }
    return null;
  }
  // Stage
  switch (t.stage) {
    case "Application filed":
      return {
        subject: `Your SSDI application has been filed — ${ctx.caseLabel}`,
        body:
          "Good news — your application has been filed with the Social Security Administration. " +
          "SSA reviews can take several months. We'll keep you posted whenever the status changes.",
        ...cta,
      };
    case "Hearing scheduled":
      return {
        subject: `Your hearing has been scheduled — ${ctx.caseLabel}`,
        body:
          "Your ALJ hearing has been scheduled. Your attorney will reach out before the hearing date " +
          "with details and a prep session. Sign in to the portal to see the date and time.",
        ...cta,
      };
    case "Award / NOA received":
      return {
        subject: `Congratulations — your award notice arrived (${ctx.caseLabel})`,
        body:
          "We received your Notice of Award from SSA. Your attorney will be in touch shortly to walk you " +
          "through next steps, including back pay and any remaining paperwork.",
        ...cta,
      };
    case "Initial decision approved":
    case "Recon decision approved":
    case "ALJ decision approved":
      return {
        subject: `Good news on your SSDI case — ${ctx.caseLabel}`,
        body:
          "SSA has issued a favorable decision on your claim. Your attorney will be in touch shortly with details.",
        ...cta,
      };
    // Adverse outcomes — copy is still rendered, but `planDelivery` will HOLD for review.
    case "Initial decision denied":
    case "Recon decision denied":
    case "ALJ decision denied":
    case "AC decision denied":
      return {
        subject: `Update on your SSDI case — ${ctx.caseLabel}`,
        body:
          "We received a decision on your case and your attorney is reviewing it. " +
          "We'll reach out soon with next steps. Please do not respond to any SSA letters until we speak.",
        ...cta,
      };
    default:
      return null;
  }
}

/**
 * Decide what to do. Pure: caller supplies all snapshots.
 *
 *   - unknown / no-template trigger → skip("no-template")
 *   - dedupe key already handled    → skip("duplicate")
 *   - milestone toggle off          → skip("milestone-disabled")
 *   - hard suppressed (bounce/etc.) → skip("email-suppressed")
 *   - email opted out               → skip("email-opted-out")
 *   - adverse stage                 → hold("adverse-outcome")
 *   - otherwise                     → send(email)
 */
export function planDelivery(ctx: PlanContext & { caseLabel: string; portalUrl?: string }): PlanAction {
  const msgKey = triggerKey(ctx.trigger);
  const copy = copyForTrigger(ctx.trigger, { caseLabel: ctx.caseLabel, portalUrl: ctx.portalUrl });
  if (!copy) return { op: "skip", reason: "no-template", msgKey };

  if (ctx.alreadyHandled) return { op: "skip", reason: "duplicate", msgKey };

  // Adverse outcomes always hold for attorney review, even if the milestone is disabled —
  // the queue is the explicit value of having a draft to edit. We still bail if dup.
  if (ctx.trigger.kind === "stage" && ADVERSE_STAGES.has(ctx.trigger.stage)) {
    return { op: "hold", reason: "adverse-outcome", msgKey, copy };
  }

  if (!ctx.settings.enabledMilestones.includes(msgKey)) {
    return { op: "skip", reason: "milestone-disabled", msgKey };
  }
  if (ctx.consent.emailHardSuppressed) {
    return { op: "skip", reason: "email-suppressed", msgKey };
  }
  if (ctx.consent.emailOptedOutAt) {
    return { op: "skip", reason: "email-opted-out", msgKey };
  }
  return { op: "send", channel: "email", msgKey, copy };
}
