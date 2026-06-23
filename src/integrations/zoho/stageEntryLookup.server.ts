/**
 * stageEntryLookup.server.ts — builds a Map<case_id, ISO date> of when each case last
 * advanced into its current stage, based on case_activity_log rows where action='stage.advance'.
 *
 * Used by the nightly SSDI sweep to compute "days in current stage" for SLA / stalled detection.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function buildStageEntryLookup(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data, error } = await supabaseAdmin
    .from("case_activity_log")
    .select("case_id, created_at")
    .eq("action", "stage.advance")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) {
    console.error("[stageEntryLookup] supabase error:", error.message);
    return map;
  }
  for (const row of data ?? []) {
    const id = row.case_id as string | null;
    const ts = row.created_at as string | null;
    if (!id || !ts) continue;
    // First (most recent) wins because we ordered DESC.
    if (!map.has(id)) map.set(id, ts);
  }
  return map;
}
