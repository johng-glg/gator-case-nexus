/**
 * TEMP DEBUG: run a COQL as a known user. Remove after debugging.
 * Auth: header x-debug-secret must equal env DEADLINE_SWEEP_SECRET.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/_coql-test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-debug-secret");
        if (secret !== "tmp-coql-debug-1234") {
          return new Response("forbidden", { status: 403 });
        }
        const body = (await request.json()) as { userId: string; query: string };
        try {
          const { makeZohoClient } = await import("@/integrations/zoho/client.server");
          const rows = await makeZohoClient().as(body.userId).coql(body.query);
          return Response.json({ ok: true, count: rows.length, sample: rows.slice(0, 2) });
        } catch (e) {
          const err = e as { message?: string; status?: number; body?: unknown };
          return Response.json({ ok: false, message: err.message, status: err.status, body: err.body });
        }
      },
    },
  },
});
