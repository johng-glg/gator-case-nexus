/**
 * Zoho Sign webhook → flips Engagement.Retainer_Status on terminal events.
 *
 * Auth: prefers Zoho Sign HMAC-SHA256 (`X-ZS-WEBHOOK-SIGNATURE` over the raw
 * body) using ZOHO_SIGN_WEBHOOK_SECRET. Falls back to a shared-secret header
 * (`x-webhook-secret` / `x-zoho-webhook-secret`) for simple Zoho configs.
 * Query-param secrets are NOT accepted (they leak into access logs).
 * Always returns 200 (even when no engagement matched) so Zoho doesn't retry-storm.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  verifyZohoSignSignature,
  ZOHO_SIGN_SIGNATURE_HEADER,
} from "@/integrations/zoho/signWebhookSecurity";

export const Route = createFileRoute("/api/public/webhooks/zoho-sign")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.ZOHO_SIGN_WEBHOOK_SECRET;
        if (!expected) {
          return new Response("Webhook not configured", { status: 500 });
        }

        // Read RAW body first — HMAC must be computed over the exact bytes Zoho sent.
        const bodyText = await request.text();

        const hmacHeader = request.headers.get(ZOHO_SIGN_SIGNATURE_HEADER) ?? undefined;
        const hmacOk =
          hmacHeader != null && verifyZohoSignSignature(bodyText, hmacHeader, expected);

        let sharedOk = false;
        if (!hmacOk) {
          const provided =
            request.headers.get("x-webhook-secret") ??
            request.headers.get("x-zoho-webhook-secret") ??
            "";
          sharedOk = provided !== "" && provided === expected;
        }

        if (!hmacOk && !sharedOk) {
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: unknown = null;
        try {
          payload = bodyText ? JSON.parse(bodyText) : null;
        } catch {
          // ignore — pass null payload to the parser, which returns null
        }

        try {
          const { makeRetainerService, makeFormsService } = await import("@/integrations/zoho/signClient.server");
          const retainerResult = await makeRetainerService().handleSignCompleted(payload);
          let formsResult: { caseId: string; code: string; status: string } | null = null;
          try {
            formsResult = await makeFormsService().handleFormSigned(payload);
          } catch (err) {
            // Forms env may not be configured yet; don't block retainer flow.
            console.warn("[zoho-sign webhook] forms handler skipped:", String(err));
          }
          return Response.json({ ok: true, retainerResult, formsResult }, { status: 200 });
        } catch (err) {
          console.error("[zoho-sign webhook] error", err);
          // Still 200 so Zoho marks delivered; failures show up in logs.
          return Response.json({ ok: true, error: String(err) }, { status: 200 });
        }
      },
    },
  },
});
