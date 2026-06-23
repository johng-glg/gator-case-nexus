/**
 * emailAdapter.server.ts — Renders the case-status-update email and enqueues it
 * directly via `supabaseAdmin`. We can't call the scaffolded
 * `/lovable/email/transactional/send` route from server code because that route
 * requires a real Supabase user JWT and we only have the service-role key here;
 * doing the same work in-process avoids the 401.
 */

import * as React from "react";
import { render } from "@react-email/components";
import { TEMPLATES } from "@/lib/email-templates/registry";

import type { MessageCopy } from "./messagingService";

const SITE_NAME = "gator-case-nexus";
const SENDER_DOMAIN = "notify.gatorlawpc.com";
const FROM_DOMAIN = "notify.gatorlawpc.com";
const TEMPLATE_NAME = "case-status-update";

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface SendInput {
  recipientEmail: string;
  caseId: string;
  msgKey: string;
  firstName?: string | null;
  caseLabel: string;
  copy: MessageCopy;
}

export async function sendCaseStatusEmail(
  input: SendInput,
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const template = TEMPLATES[TEMPLATE_NAME];
  if (!template) return { ok: false, error: `Template '${TEMPLATE_NAME}' not registered` };

  let supabaseAdmin: typeof import("@/integrations/supabase/client.server").supabaseAdmin;
  try {
    ({ supabaseAdmin } = await import("@/integrations/supabase/client.server"));
  } catch (err) {
    return { ok: false, error: `admin client unavailable: ${err instanceof Error ? err.message : String(err)}` };
  }

  const recipient = input.recipientEmail.trim();
  const normalized = recipient.toLowerCase();
  const messageId = crypto.randomUUID();
  const idempotencyKey = `case-${input.caseId}-${input.msgKey}`;

  // 1. Suppression check.
  const { data: suppressed, error: suppressionErr } = await supabaseAdmin
    .from("suppressed_emails")
    .select("id")
    .eq("email", normalized)
    .maybeSingle();
  if (suppressionErr) return { ok: false, error: `suppression lookup: ${suppressionErr.message}` };
  if (suppressed) {
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: TEMPLATE_NAME,
      recipient_email: recipient,
      status: "suppressed",
    });
    return { ok: false, error: "recipient suppressed" };
  }

  // 2. Unsubscribe token (one per email).
  let unsubscribeToken: string;
  const { data: existing, error: tokenLookupErr } = await supabaseAdmin
    .from("email_unsubscribe_tokens")
    .select("token, used_at")
    .eq("email", normalized)
    .maybeSingle();
  if (tokenLookupErr) return { ok: false, error: `token lookup: ${tokenLookupErr.message}` };
  if (existing && !existing.used_at) {
    unsubscribeToken = existing.token;
  } else if (!existing) {
    const fresh = generateToken();
    await supabaseAdmin
      .from("email_unsubscribe_tokens")
      .upsert({ token: fresh, email: normalized }, { onConflict: "email", ignoreDuplicates: true });
    const { data: stored, error: reReadErr } = await supabaseAdmin
      .from("email_unsubscribe_tokens")
      .select("token")
      .eq("email", normalized)
      .maybeSingle();
    if (reReadErr || !stored) return { ok: false, error: "unsubscribe token persistence failed" };
    unsubscribeToken = stored.token;
  } else {
    // Token exists but is already used — treat as suppressed.
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: TEMPLATE_NAME,
      recipient_email: recipient,
      status: "suppressed",
      error_message: "unsubscribe token already used",
    });
    return { ok: false, error: "recipient previously unsubscribed" };
  }

  // 3. Render template.
  const templateData = {
    firstName: input.firstName ?? null,
    caseLabel: input.caseLabel,
    subjectLine: input.copy.subject,
    bodyText: input.copy.body,
    ctaLabel: input.copy.ctaLabel ?? null,
    ctaUrl: input.copy.ctaUrl ?? null,
    siteName: "Gator Law",
  };
  const element = React.createElement(
    template.component as React.ComponentType<typeof templateData>,
    templateData,
  );
  let html: string;
  let plainText: string;
  try {
    html = await render(element);
    plainText = await render(element, { plainText: true });
  } catch (err) {
    return { ok: false, error: `render failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  const resolvedSubject =
    typeof template.subject === "function"
      ? (template.subject as (d: typeof templateData) => string)(templateData)
      : template.subject;

  // 4. Pending log row then enqueue.
  await supabaseAdmin.from("email_send_log").insert({
    message_id: messageId,
    template_name: TEMPLATE_NAME,
    recipient_email: recipient,
    status: "pending",
  });

  const { error: enqueueErr } = await supabaseAdmin.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      to: recipient,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: resolvedSubject,
      html,
      text: plainText,
      purpose: "transactional",
      label: TEMPLATE_NAME,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  });
  if (enqueueErr) {
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: TEMPLATE_NAME,
      recipient_email: recipient,
      status: "failed",
      error_message: `enqueue: ${enqueueErr.message}`,
    });
    return { ok: false, error: `enqueue failed: ${enqueueErr.message}` };
  }

  return { ok: true, messageId };
}
