/**
 * audit.server.ts — fire-and-forget activity logger for SSDI cases.
 *
 * Writes to `public.case_activity_log` via the service-role client so RLS doesn't
 * apply (the table is staff-readable; only the server writes). Failures are
 * swallowed and logged to console — never break a user mutation because the
 * audit insert failed.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ActivityAction =
  | "stage.advance"
  | "deadline.update"
  | "cost.create"
  | "cost.delete"
  | "task.create"
  | "task.complete"
  | "task.reopen"
  | "task.reassign"
  | "portal.invite"
  | "case.dates.update"
  | "document.request.create"
  | "document.request.cancel"
  | "document.upload"
  | "message.sent"
  | "message.held"
  | "message.discarded"
  | "consent.update"
  | "records.followup"
  | "records.status"
  | "lead.convert.override";


export interface LogActivityInput {
  caseId?: string | null;
  engagementId?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: ActivityAction;
  summary: string;
  metadata?: Record<string, unknown>;
}

export async function logCaseActivity(input: LogActivityInput): Promise<void> {
  if (!input.caseId && !input.engagementId) {
    console.error("[audit] refusing to log activity without case or engagement scope", input.action);
    return;
  }
  try {
    await supabaseAdmin.from("case_activity_log").insert({
      case_id: input.caseId ?? null,
      engagement_id: input.engagementId ?? null,
      actor_user_id: input.actorUserId ?? null,
      actor_email: input.actorEmail ?? null,
      action: input.action,
      summary: input.summary,
      metadata: (input.metadata ?? {}) as never,
    });
  } catch (err) {
    console.error("[audit] failed to log activity", { action: input.action, err });
  }
}
