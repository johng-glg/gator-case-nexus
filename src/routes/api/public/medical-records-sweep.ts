/**
 * Nightly Medical Records follow-up sweep.
 *
 * Pulls open Records_Requests, runs followupSweepUpdates() (engine), creates a Zoho
 * Task per due request (deduped by What_Id), tallies stale rows, logs to
 * `public.medical_records_sweep_log`.
 *
 * NEVER mutates Followup_Count — only `logFollowup` (engine: applyFollowup) does that.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/medical-records-sweep")({
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
          const {
            followupSweepUpdates,
            isStale,
            type: _t,
          } = await import("@/integrations/zoho/medicalRecords") as typeof import("@/integrations/zoho/medicalRecords") & { type?: unknown };

          const client = makeZohoClient();
          const serviceUserId = process.env.ZOHO_SERVICE_USER_ID ?? "";
          const api = client.as(serviceUserId || "service");

          const rows = await api.coql<{
            id: string;
            Provider_Name?: string;
            Request_Status: "Not started" | "Requested" | "Followed up" | "Received" | "Unable to obtain" | "Cancelled";
            Requested_Date?: string | null;
            Last_Followup_Date?: string | null;
            Followup_Count?: number | null;
            SSDI_Case?: { id: string } | string | null;
          }>(
            `select id, Provider_Name, Request_Status, Requested_Date, Last_Followup_Date, Followup_Count, SSDI_Case from Records_Requests where Request_Status in ('Requested','Followed up')`,
          );

          const today = new Date();
          const openCount = rows.length;
          const staleCount = rows.filter((r) => isStale(r as never, today)).length;

          const due = followupSweepUpdates(rows as never[], today) as typeof rows;

          // Dedupe by request id (What_Id) — never create more than one task per request per sweep.
          const seen = new Set<string>();
          const tasksToCreate = due
            .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
            .map((r) => ({
              Subject: `Follow up: medical records — ${r.Provider_Name ?? "provider"}`,
              Status: "Not Started",
              Priority: "High",
              Due_Date: today.toISOString().slice(0, 10),
              What_Id: { id: r.id },
              $se_module: "Records_Requests",
            }));

          let tasksCreated = 0;
          if (tasksToCreate.length > 0) {
            try {
              const res = await api.createRecords("Tasks", tasksToCreate);
              tasksCreated = res.length;
            } catch (e) {
              console.error("[medical-records-sweep] task creation failed", e);
            }
          }

          await supabaseAdmin.from("medical_records_sweep_log").insert({
            open_count: openCount,
            tasks_created: tasksCreated,
            stale_count: staleCount,
          });

          return Response.json({
            ok: true,
            openCount,
            tasksCreated,
            staleCount,
          });
        } catch (e) {
          console.error("Medical records sweep failed:", e);
          const message = e instanceof Error ? e.message : String(e);
          try {
            await supabaseAdmin.from("medical_records_sweep_log").insert({ error_message: message });
          } catch (logErr) {
            console.error("Failed to log sweep error:", logErr);
          }
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
