/**
 * Zoho Sign webhook → flips Engagement.Retainer_Status on terminal events.
 *
 * Secured by a shared secret. Zoho Sign can pass it as a header
 * (`X-Webhook-Secret`) or as `?secret=` in the configured URL. Always returns 200
 * (even when no engagement matched) so Zoho doesn't retry-storm.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/zoho-sign")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.ZOHO_SIGN_WEBHOOK_SECRET;
        if (!expected) {
          return new Response("Webhook not configured", { status: 500 });
        }

        const url = new URL(request.url);
        const provided =
          request.headers.get("x-webhook-secret") ??
          request.headers.get("x-zoho-webhook-secret") ??
          url.searchParams.get("secret") ??
          "";
        if (provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const bodyText = await request.text();
        let payload: unknown = null;
        try {
          payload = bodyText ? JSON.parse(bodyText) : null;
        } catch {
          // ignore — pass null payload to the parser, which returns null
        }

        try {
          const { makeRetainerService } = await import("@/integrations/zoho/signClient.server");
          const result = await makeRetainerService().handleSignCompleted(payload);
          console.log("[zoho-sign webhook]", result ?? "no-op");
          return Response.json({ ok: true, result }, { status: 200 });
        } catch (err) {
          console.error("[zoho-sign webhook] error", err);
          // Still 200 so Zoho marks delivered; failures show up in logs.
          return Response.json({ ok: true, error: String(err) }, { status: 200 });
        }
      },
    },
  },
});
