/**
 * messaging.functions.ts — server fns for client messaging UI.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/rbac";

const FIRM_DOMAIN = "gatorlawpc.com";

function isStaff(email: string | undefined): email is string {
  return !!email && email.toLowerCase().endsWith(`@${FIRM_DOMAIN}`);
}

function actorEmail(claims: unknown): string | null {
  if (claims && typeof claims === "object" && "email" in claims) {
    const e = (claims as { email?: unknown }).email;
    return typeof e === "string" ? e : null;
  }
  return null;
}

const caseIdInput = z.object({ caseId: z.string().regex(/^[A-Za-z0-9_]+$/) });

/** STAFF — list open held messages and recent send history for a case. */
export const listCaseMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => caseIdInput.parse(d))
  .handler(async ({ data, context }) => {
    if (!isStaff(actorEmail(context.claims) ?? undefined)) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [held, log, link] = await Promise.all([
      supabaseAdmin
        .from("held_messages")
        .select("id, msg_key, subject, body, recipient_email, cta_label, cta_url, reason, created_at")
        .eq("case_id", data.caseId)
        .is("sent_at", null)
        .is("discarded_at", null)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("case_activity_log")
        .select("id, action, summary, created_at, metadata")
        .eq("case_id", data.caseId)
        .in("action", ["message.sent", "message.held", "message.discarded"])
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("client_portal_links")
        .select("user_id")
        .eq("zoho_case_id", data.caseId)
        .maybeSingle(),
    ]);

    let consent: { emailOptedOutAt: string | null } | null = null;
    let clientEmail: string | null = null;
    if (link.data?.user_id) {
      const { data: c } = await supabaseAdmin
        .from("client_messaging_consent")
        .select("email_opted_out_at")
        .eq("client_id", link.data.user_id)
        .maybeSingle();
      consent = { emailOptedOutAt: (c?.email_opted_out_at as string | null | undefined) ?? null };
      const u = await supabaseAdmin.auth.admin.getUserById(link.data.user_id);
      clientEmail = u.data.user?.email ?? null;
    }

    // Decorate sent-history entries with the latest email_send_log status
    // so the panel can surface delivery failures instead of pretending they sent.
    const history = log.data ?? [];
    const messageIds = history
      .map((h: any) => (h.metadata as any)?.messageId)
      .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
    const sendStatusByMessageId = new Map<string, string>();
    if (messageIds.length > 0) {
      const { data: logs } = await supabaseAdmin
        .from("email_send_log")
        .select("message_id, status, created_at, error_message")
        .in("message_id", messageIds)
        .order("created_at", { ascending: false });
      for (const row of logs ?? []) {
        const mid = row.message_id as string;
        if (!sendStatusByMessageId.has(mid)) {
          sendStatusByMessageId.set(mid, String(row.status ?? ""));
        }
      }
    }
    const decoratedHistory = history.map((h: any) => {
      const mid = (h.metadata as any)?.messageId;
      const status = typeof mid === "string" ? sendStatusByMessageId.get(mid) ?? null : null;
      return { ...h, deliveryStatus: status };
    });

    return {
      held: held.data ?? [],
      history: decoratedHistory,
      hasPortalLink: !!link.data?.user_id,
      consent,
      clientEmail,
    };
  });

const heldIdInput = z.object({ heldId: z.string().uuid() });
const sendHeldInput = heldIdInput.extend({
  subject: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(5000).optional(),
});

export const sendHeldMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => sendHeldInput.parse(d))
  .handler(async ({ data, context }) => {
    if (!isStaff(actorEmail(context.claims) ?? undefined)) throw new Error("Forbidden");
    const { sendHeldNow } = await import("@/integrations/messaging/notifyService.server");
    const res = await sendHeldNow(data.heldId, context.userId, {
      subject: data.subject,
      body: data.body,
    });
    if (!res.ok) throw new Error(res.error);
    return { ok: true };
  });

export const discardHeldMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => heldIdInput.parse(d))
  .handler(async ({ data, context }) => {
    if (!isStaff(actorEmail(context.claims) ?? undefined)) throw new Error("Forbidden");
    const { discardHeld } = await import("@/integrations/messaging/notifyService.server");
    await discardHeld(data.heldId, context.userId);
    return { ok: true };
  });

/* ---------------- Settings (admin) ---------------- */

export const getMessagingSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("messaging_settings")
      .select("enabled_milestones, sms_enabled, updated_at")
      .eq("id", true)
      .maybeSingle();
    return {
      enabledMilestones: (data?.enabled_milestones as string[] | undefined) ?? [],
      smsEnabled: !!data?.sms_enabled,
      updatedAt: (data?.updated_at as string | undefined) ?? null,
    };
  });

const setSettingsInput = z.object({
  enabledMilestones: z.array(z.string().min(1).max(100)).max(40),
});

export const setMessagingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => setSettingsInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any, "setMessagingSettings");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("messaging_settings")
      .update({ enabled_milestones: data.enabledMilestones })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Portal client ---------------- */

const EMAIL_CONSENT_TEXT =
  "I agree to receive case-update emails from Gator Law about my case (filings, hearings, decisions, document requests). I can unsubscribe at any time.";

export const getMyMessagingConsent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("client_messaging_consent")
      .select("email_opted_out_at, email_consent_text, email_consent_at, sms_opt_in")
      .eq("client_id", context.userId)
      .maybeSingle();
    return {
      emailOptedOut: !!data?.email_opted_out_at,
      emailOptedOutAt: (data?.email_opted_out_at as string | null | undefined) ?? null,
      emailConsentText: (data?.email_consent_text as string | null | undefined) ?? EMAIL_CONSENT_TEXT,
      emailConsentAt: (data?.email_consent_at as string | null | undefined) ?? null,
      smsEnabled: false, // hidden until SMS phase ships
      currentEmailConsentText: EMAIL_CONSENT_TEXT,
    };
  });

const setEmailOptOutInput = z.object({ optedOut: z.boolean() });

export const setMyEmailOptOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => setEmailOptOutInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logCaseActivity } = await import("@/integrations/audit/log.server");
    const now = new Date().toISOString();
    const payload = data.optedOut
      ? { client_id: context.userId, email_opted_out_at: now }
      : {
          client_id: context.userId,
          email_opted_out_at: null,
          email_consent_text: EMAIL_CONSENT_TEXT,
          email_consent_source: "portal-settings",
          email_consent_at: now,
        };
    const { error } = await (supabaseAdmin as any)
      .from("client_messaging_consent")
      .upsert(payload, { onConflict: "client_id" });
    if (error) throw new Error(error.message);

    // Look up the case for activity log scoping (best effort).
    const { data: link } = await supabaseAdmin
      .from("client_portal_links")
      .select("zoho_case_id, zoho_engagement_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (link?.zoho_case_id) {
      await logCaseActivity({
        caseId: link.zoho_case_id,
        engagementId: link.zoho_engagement_id ?? null,
        actorUserId: context.userId,
        actorEmail: actorEmail(context.claims),
        action: "consent.update",
        summary: data.optedOut ? "Client opted out of case-update emails." : "Client opted in to case-update emails.",
        metadata: { channel: "email", optedOut: data.optedOut, text: EMAIL_CONSENT_TEXT, source: "portal-settings" },
      });
    }
    return { ok: true };
  });
