/**
 * Daily SSDI deadline sweep.
 *
 * Recomputes Deadline_Date / Days_To_Deadline / Deadline_At_Risk + Release_Expiring_Soon for
 * every open SSDI case, then writes a digest row (overdue / due-soon / release-expiring) to
 * public.ssdi_deadline_digests for the in-app Admin view.
 *
 * Authorized via Authorization: Bearer <DEADLINE_SWEEP_SECRET> or Supabase apikey header.
 * Runs as the SERVICE actor (refresh token in ZOHO_SERVICE_REFRESH_TOKEN env).
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/deadline-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const apikey = request.headers.get("apikey") ?? "";
        const expected = `Bearer ${process.env.DEADLINE_SWEEP_SECRET ?? ""}`;
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
        const authorized =
          (process.env.DEADLINE_SWEEP_SECRET && auth === expected) ||
          (Boolean(anonKey) && apikey === anonKey);
        if (!authorized) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        try {
          const { makeZohoClient } = await import("@/integrations/zoho/client.server");
          const { createCaseService } = await import("@/integrations/zoho/caseService");
          const { syncAllOpenCases } = await import("@/integrations/zoho/caseCalendarSync");
          const result = await createCaseService({ zoho: makeZohoClient() }).runDailyDeadlineSweep();

          // Reconcile Google Calendar after recomputing deadlines. Calendar failures
          // must not fail the sweep — capture counts and continue.
          let cal = { created: 0, updated: 0, deleted: 0, errors: 0 };
          try {
            cal = await syncAllOpenCases();
          } catch (calErr) {
            console.error("[deadline-sweep] calendar sync failed:", calErr);
            cal.errors++;
          }

          await supabaseAdmin.from("ssdi_deadline_digests").insert({
            scanned: result.scanned,
            updated: result.updated,
            overdue: result.overdue as unknown as never,
            due_soon: result.dueSoon as unknown as never,
            release_expiring: result.releaseExpiring as unknown as never,
            calendar_created: cal.created,
            calendar_updated: cal.updated,
            calendar_deleted: cal.deleted,
            calendar_errors: cal.errors,
          });

          return Response.json({
            ok: true,
            scanned: result.scanned,
            updated: result.updated,
            overdueCount: result.overdue.length,
            dueSoonCount: result.dueSoon.length,
            releaseExpiringCount: result.releaseExpiring.length,
            calendar: cal,
          });
        } catch (e) {
          console.error("Deadline sweep failed:", e);
          const message = e instanceof Error ? e.message : String(e);
          try {
            await supabaseAdmin.from("ssdi_deadline_digests").insert({ error: message });
          } catch (logErr) {
            console.error("Failed to log digest error:", logErr);
          }
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
