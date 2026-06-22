/**
 * emailAdapter.server.ts — Wraps the scaffolded /lovable/email/transactional/send route.
 *
 * Called from server functions only. Uses the service-role JWT as the bearer
 * so the call clears the route's `requireSupabaseAuth`-style check.
 */

import type { MessageCopy } from "./messagingService";

const SEND_PATH = "/lovable/email/transactional/send";

function siteUrl(): string {
  return (
    process.env.SITE_URL ||
    process.env.VITE_SITE_URL ||
    "https://gator-case-nexus.lovable.app"
  ).replace(/\/$/, "");
}

export interface SendInput {
  recipientEmail: string;
  caseId: string;
  msgKey: string;
  firstName?: string | null;
  caseLabel: string;
  copy: MessageCopy;
}

export async function sendCaseStatusEmail(input: SendInput): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const url = `${siteUrl()}${SEND_PATH}`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" };

  const idempotencyKey = `case-${input.caseId}-${input.msgKey}`;

  const body = {
    templateName: "case-status-update",
    recipientEmail: input.recipientEmail,
    idempotencyKey,
    templateData: {
      firstName: input.firstName ?? null,
      caseLabel: input.caseLabel,
      subjectLine: input.copy.subject,
      bodyText: input.copy.body,
      ctaLabel: input.copy.ctaLabel ?? null,
      ctaUrl: input.copy.ctaUrl ?? null,
      siteName: "Gator Law",
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `email send ${res.status}: ${text || res.statusText}` };
  }
  const json = (await res.json().catch(() => ({}))) as { message_id?: string; messageId?: string };
  return { ok: true, messageId: json.message_id || json.messageId || idempotencyKey };
}
