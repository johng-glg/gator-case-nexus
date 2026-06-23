/**
 * rbac.ts — server-side role enforcement helpers.
 *
 * Usage inside a createServerFn handler that already runs requireSupabaseAuth:
 *
 *   await assertAdmin(context, "fnName");
 *   await assertStaff(context, "fnName");
 *
 * Denials are recorded in case_activity_log with action="security.role_denied"
 * so we can audit attempts.
 *
 * NOTE: This module is safe to import at the top of a *.functions.ts file —
 * it only references the supabase client from context (passed in). The admin
 * client is dynamic-imported on the denial path.
 */

type Role = "admin" | "staff";

type Ctx = {
  supabase: any;
  userId: string;
  claims?: { email?: string | null } | any;
};

async function hasRole(context: Ctx, role: Role): Promise<boolean> {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: role,
  });
  if (error) throw new Error(`Role check failed: ${error.message}`);
  return Boolean(data);
}

async function logDenial(
  context: Ctx,
  required: Role,
  fnName: string,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const email =
      (context.claims && (context.claims.email as string | undefined)) ?? null;
    await supabaseAdmin.from("case_activity_log").insert({
      // schema requires case_id OR engagement_id; use a sentinel scope so
      // the row is queryable but doesn't pollute a real case timeline.
      case_id: "__security__",
      actor_user_id: context.userId,
      actor_email: email,
      action: "security.role_denied",
      summary: `Denied: ${fnName} requires ${required}`,
      metadata: { fn: fnName, required_role: required },
    });
  } catch {
    // Never let audit-logging failure swallow the real auth error.
  }
}

export async function assertAdmin(context: Ctx, fnName: string): Promise<void> {
  if (await hasRole(context, "admin")) return;
  await logDenial(context, "admin", fnName);
  throw new Error("Forbidden: admin role required");
}

export async function assertStaff(context: Ctx, fnName: string): Promise<void> {
  // Admin counts as staff.
  if (await hasRole(context, "admin")) return;
  if (await hasRole(context, "staff")) return;
  await logDenial(context, "staff", fnName);
  throw new Error("Forbidden: staff role required");
}

export async function getMyRolesFromCtx(context: Ctx): Promise<Role[]> {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => r.role as Role);
}
