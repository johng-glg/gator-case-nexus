/**
 * Daily deadline sweep — recompute Days_To_Deadline / At_Risk / release fields.
 *
 * External cron hits this with Authorization: Bearer <DEADLINE_SWEEP_SECRET>.
 * Runs as the SERVICE actor (refresh token in ZOHO_SERVICE_REFRESH_TOKEN env).
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/deadline-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const expected = `Bearer ${process.env.DEADLINE_SWEEP_SECRET ?? ""}`;
        if (!process.env.DEADLINE_SWEEP_SECRET || auth !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const { makeZohoClient } = await import("@/integrations/zoho/client.server");
          const { createCaseService } = await import("@/integrations/zoho/caseService");
          const result = await createCaseService({ zoho: makeZohoClient() }).runDailyDeadlineSweep();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          console.error("Deadline sweep failed:", e);
          return Response.json({ ok: false, error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
