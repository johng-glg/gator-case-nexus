/**
 * activity.functions.ts — Read-only access to the case_activity_log.
 *
 * Both functions require staff (firm-domain). RLS on the table also enforces
 * this; the explicit check here gives a clearer error message and avoids
 * leaking row shapes to a portal client who somehow targets this RPC.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FIRM_DOMAIN = "gatorlawpc.com";

function ensureStaff(claims: unknown): string {
  const email =
    claims && typeof claims === "object" && "email" in claims
      ? ((claims as { email?: unknown }).email as string | undefined)
      : undefined;
  if (!email || !email.toLowerCase().endsWith(`@${FIRM_DOMAIN}`)) {
    throw new Error("Forbidden: firm staff only.");
  }
  return email;
}

const ID_RE = /^[A-Za-z0-9_]+$/;

export type ActivityRow = {
  id: string;
  case_id: string | null;
  engagement_id: string | null;
  actor_email: string | null;
  action: string;
  summary: string;
  metadata: unknown;
  created_at: string;
};

const caseActivityInput = z.object({
  caseId: z.string().regex(ID_RE),
  engagementId: z.string().regex(ID_RE).optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export const getCaseActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => caseActivityInput.parse(data))
  .handler(async ({ data, context }) => {
    ensureStaff(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = data.limit ?? 100;
    const orParts = [`case_id.eq.${data.caseId}`];
    if (data.engagementId) orParts.push(`engagement_id.eq.${data.engagementId}`);
    const { data: rows, error } = await supabaseAdmin
      .from("case_activity_log")
      .select("id, case_id, engagement_id, actor_email, action, summary, metadata, created_at")
      .or(orParts.join(","))
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as ActivityRow[] };
  });

const firmActivityInput = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  action: z.string().trim().max(50).optional(),
  actorEmail: z.string().trim().max(255).optional(),
});

export const getFirmActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => firmActivityInput.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    ensureStaff(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("case_activity_log")
      .select("id, case_id, engagement_id, actor_email, action, summary, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.action) q = q.eq("action", data.action);
    if (data.actorEmail) q = q.eq("actor_email", data.actorEmail.toLowerCase());
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as ActivityRow[] };
  });
