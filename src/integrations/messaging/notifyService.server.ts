/**
 * notifyService.server.ts — orchestrates milestone client notifications.
 *
 * Loads consent + settings, asks the pure planner what to do, then either:
 *   - sends an email (via the app-email queue), or
 *   - inserts a `held_messages` row for attorney review, or
 *   - skips (with a recorded reason).
 *
 * Every outcome is written to `case_activity_log` so the case Activity panel
 * and the firm-wide Activity Log show it.
 *
 * Idempotency: the activity log lookup on (case_id, action='message.*', metadata->>'msgKey')
 * acts as the dedupe gate. Re-running the same trigger is a no-op.
 */

import {
  planDelivery,
  type ConsentSnapshot,
  type MessagingSettingsSnapshot,
  type Trigger,
} from "./messagingService";

const FIRM_DOMAIN = "gatorlawpc.com";

export interface NotifyInput {
  caseId: string;
  trigger: Trigger;
}

export interface NotifyOutcome {
  outcome: "sent" | "held" | "skipped" | "no-recipient";
  msgKey: string;
  reason?: string;
  heldMessageId?: string;
}

interface PortalLink {
  user_id: string;
  zoho_case_id: string;
  zoho_engagement_id: string | null;
}

interface SupabaseAdminLike {
  from: (table: string) => any;
  auth: { admin: { getUserById: (id: string) => Promise<{ data: { user: { email?: string | null; user_metadata?: any } | null }; error: any }> } };
}

async function loadSettings(supabaseAdmin: SupabaseAdminLike): Promise<MessagingSettingsSnapshot> {
  const { data } = await supabaseAdmin
    .from("messaging_settings")
    .select("enabled_milestones")
    .eq("id", true)
    .maybeSingle();
  const list = (data?.enabled_milestones as string[] | undefined) ?? [];
  return { enabledMilestones: list };
}

async function loadPortalLink(supabaseAdmin: SupabaseAdminLike, caseId: string): Promise<PortalLink | null> {
  const { data } = await supabaseAdmin
    .from("client_portal_links")
    .select("user_id, zoho_case_id, zoho_engagement_id")
    .eq("zoho_case_id", caseId)
    .maybeSingle();
  return (data as PortalLink | null) ?? null;
}

async function loadConsent(supabaseAdmin: SupabaseAdminLike, clientId: string, email: string): Promise<ConsentSnapshot> {
  const [{ data: c }, { data: s }] = await Promise.all([
    supabaseAdmin
      .from("client_messaging_consent")
      .select("email_opted_out_at")
      .eq("client_id", clientId)
      .maybeSingle(),
    supabaseAdmin
      .from("suppressed_emails")
      .select("email")
      .eq("email", email.toLowerCase())
      .maybeSingle()
      .then((r: any) => r)
      .catch(() => ({ data: null })),
  ]);
  return {
    emailOptedOutAt: (c?.email_opted_out_at as string | null | undefined) ?? null,
    emailHardSuppressed: !!s?.email,
  };
}

async function alreadyHandled(supabaseAdmin: SupabaseAdminLike, caseId: string, msgKey: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("case_activity_log")
    .select("id")
    .eq("case_id", caseId)
    .in("action", ["message.sent", "message.held"])
    .contains("metadata", { msgKey })
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

async function loadCaseLabel(caseId: string): Promise<string> {
  try {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const { SERVICE_ACTOR } = await import("@/integrations/zoho/zohoClient");
    const rec = await makeZohoClient().as(SERVICE_ACTOR).getRecord<{ Case_Number?: string }>(
      "SSDI_Cases",
      caseId,
      ["Case_Number"],
    );
    return rec?.Case_Number || caseId;
  } catch {
    return caseId;
  }
}

function siteUrl(): string {
  return (
    process.env.SITE_URL ||
    process.env.VITE_SITE_URL ||
    "https://gator-case-nexus.lovable.app"
  ).replace(/\/$/, "");
}

export async function notify(input: NotifyInput): Promise<NotifyOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { logCaseActivity } = await import("@/integrations/audit/log.server");

  const link = await loadPortalLink(supabaseAdmin as unknown as SupabaseAdminLike, input.caseId);
  if (!link) {
    return { outcome: "no-recipient", msgKey: input.trigger.kind === "stage" ? `stage:${input.trigger.stage}` : `event:${input.trigger.event}` };
  }
  const userRes = await (supabaseAdmin as unknown as SupabaseAdminLike).auth.admin.getUserById(link.user_id);
  const email = userRes.data.user?.email || null;
  const firstName =
    (userRes.data.user?.user_metadata?.first_name as string | undefined) ||
    (userRes.data.user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ||
    null;
  if (!email || email.toLowerCase().endsWith(`@${FIRM_DOMAIN}`)) {
    // Don't send to staff-domain accounts that somehow got linked.
    return { outcome: "no-recipient", msgKey: input.trigger.kind === "stage" ? `stage:${input.trigger.stage}` : `event:${input.trigger.event}` };
  }

  const [settings, consent, caseLabel] = await Promise.all([
    loadSettings(supabaseAdmin as unknown as SupabaseAdminLike),
    loadConsent(supabaseAdmin as unknown as SupabaseAdminLike, link.user_id, email),
    loadCaseLabel(input.caseId),
  ]);

  const portalUrl = `${siteUrl()}/portal`;

  const initialPlan = planDelivery({
    trigger: input.trigger,
    consent,
    settings,
    alreadyHandled: false,
    caseLabel,
    portalUrl,
  });

  if (initialPlan.op === "skip" && initialPlan.reason === "no-template") {
    return { outcome: "skipped", reason: initialPlan.reason, msgKey: initialPlan.msgKey };
  }

  const dup = await alreadyHandled(supabaseAdmin as unknown as SupabaseAdminLike, input.caseId, initialPlan.msgKey);
  const plan = dup
    ? { op: "skip" as const, reason: "duplicate" as const, msgKey: initialPlan.msgKey }
    : initialPlan;

  if (plan.op === "skip") {
    await logCaseActivity({
      caseId: input.caseId,
      engagementId: link.zoho_engagement_id,
      action: "message.held",
      summary: `Message skipped (${plan.reason}).`,
      metadata: { msgKey: plan.msgKey, reason: plan.reason, skipped: true },
    });
    return { outcome: "skipped", reason: plan.reason, msgKey: plan.msgKey };
  }

  if (plan.op === "hold") {
    const { data: row, error } = await (supabaseAdmin as any)
      .from("held_messages")
      .insert({
        case_id: input.caseId,
        client_id: link.user_id,
        msg_key: plan.msgKey,
        channel: "email",
        recipient_email: email,
        subject: plan.copy.subject,
        body: plan.copy.body,
        cta_label: plan.copy.ctaLabel ?? null,
        cta_url: plan.copy.ctaUrl ?? null,
        reason: plan.reason,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[notify] failed to insert held_messages", error);
      return { outcome: "skipped", reason: "db-error", msgKey: plan.msgKey };
    }
    await logCaseActivity({
      caseId: input.caseId,
      engagementId: link.zoho_engagement_id,
      action: "message.held",
      summary: `Message held for attorney review (${plan.reason}): "${plan.copy.subject}".`,
      metadata: { msgKey: plan.msgKey, heldMessageId: row.id, reason: plan.reason },
    });
    return { outcome: "held", msgKey: plan.msgKey, heldMessageId: row.id };
  }

  // send
  const { sendCaseStatusEmail } = await import("./emailAdapter.server");
  const result = await sendCaseStatusEmail({
    recipientEmail: email,
    caseId: input.caseId,
    msgKey: plan.msgKey,
    firstName,
    caseLabel,
    copy: plan.copy,
  });
  if (!result.ok) {
    await logCaseActivity({
      caseId: input.caseId,
      engagementId: link.zoho_engagement_id,
      action: "message.held",
      summary: `Message send failed: ${result.error}`,
      metadata: { msgKey: plan.msgKey, error: result.error },
    });
    return { outcome: "skipped", reason: "send-error", msgKey: plan.msgKey };
  }
  await logCaseActivity({
    caseId: input.caseId,
    engagementId: link.zoho_engagement_id,
    action: "message.sent",
    summary: `Sent email: "${plan.copy.subject}".`,
    metadata: { msgKey: plan.msgKey, messageId: result.messageId, recipient: email },
  });
  return { outcome: "sent", msgKey: plan.msgKey };
}

/** Never-throws wrapper for use inside user-facing mutations. */
export async function notifySafe(input: NotifyInput): Promise<NotifyOutcome | null> {
  try {
    return await notify(input);
  } catch (err) {
    console.error("[notify] safe wrapper caught", err);
    return null;
  }
}

/** Send a previously-held draft (after attorney review/edit). */
export async function sendHeldNow(
  heldId: string,
  sentByUserId: string,
  override?: { subject?: string; body?: string; ctaLabel?: string | null; ctaUrl?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { logCaseActivity } = await import("@/integrations/audit/log.server");

  const { data: row, error } = await supabaseAdmin
    .from("held_messages")
    .select("*")
    .eq("id", heldId)
    .maybeSingle();
  if (error || !row) return { ok: false, error: error?.message || "Held message not found" };
  if (row.sent_at) return { ok: false, error: "Already sent" };
  if (row.discarded_at) return { ok: false, error: "Already discarded" };

  const subject = override?.subject?.trim() || row.subject;
  const body = override?.body?.trim() || row.body;
  const ctaLabel = override?.ctaLabel !== undefined ? override.ctaLabel : row.cta_label;
  const ctaUrl = override?.ctaUrl !== undefined ? override.ctaUrl : row.cta_url;

  const caseLabel = await loadCaseLabel(row.case_id);
  const { sendCaseStatusEmail } = await import("./emailAdapter.server");
  const res = await sendCaseStatusEmail({
    recipientEmail: row.recipient_email,
    caseId: row.case_id,
    msgKey: row.msg_key,
    firstName: null,
    caseLabel,
    copy: { subject, body, ctaLabel: ctaLabel || undefined, ctaUrl: ctaUrl || undefined },
  });
  if (!res.ok) return { ok: false, error: res.error };

  await (supabaseAdmin as any)
    .from("held_messages")
    .update({ sent_at: new Date().toISOString(), sent_by: sentByUserId, subject, body, cta_label: ctaLabel, cta_url: ctaUrl })
    .eq("id", heldId);
  await logCaseActivity({
    caseId: row.case_id,
    action: "message.sent",
    actorUserId: sentByUserId,
    summary: `Sent reviewed message: "${subject}".`,
    metadata: { msgKey: row.msg_key, heldMessageId: heldId, recipient: row.recipient_email },
  });
  return { ok: true };
}

export async function discardHeld(heldId: string, byUserId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { logCaseActivity } = await import("@/integrations/audit/log.server");
  const { data: row } = await (supabaseAdmin as any)
    .from("held_messages")
    .update({ discarded_at: new Date().toISOString(), discarded_by: byUserId })
    .eq("id", heldId)
    .is("sent_at", null)
    .is("discarded_at", null)
    .select("case_id, msg_key, subject")
    .maybeSingle();
  if (row) {
    await logCaseActivity({
      caseId: row.case_id,
      action: "message.discarded",
      actorUserId: byUserId,
      summary: `Discarded draft: "${row.subject}".`,
      metadata: { msgKey: row.msg_key, heldMessageId: heldId },
    });
  }
}
