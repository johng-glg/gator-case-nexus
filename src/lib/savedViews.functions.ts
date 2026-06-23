/**
 * savedViews.functions.ts — per-user saved filter presets with optional firm-wide sharing.
 *
 * Each row is scoped to (user_id, page, name). `shared_with_firm = true` lets
 * any signed-in staff member read the preset (RLS enforces this). Only the
 * owner can rename, edit, share/unshare, or delete.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export interface SavedView {
  id: string;
  name: string;
  params: Json;
  updated_at: string;
  user_id: string;
  shared_with_firm: boolean;
  created_by_email: string | null;
}

const pageInput = z.object({ page: z.string().min(1).max(64) });
const upsertInput = z.object({
  page: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: z.any(),
  shared_with_firm: z.boolean().optional(),
});
const deleteInput = z.object({ id: z.string().uuid() });
const shareInput = z.object({ id: z.string().uuid(), shared: z.boolean() });

function emailFromClaims(claims: unknown): string | null {
  if (claims && typeof claims === "object" && "email" in claims) {
    const v = (claims as { email?: unknown }).email;
    return typeof v === "string" ? v : null;
  }
  return null;
}

export const listSavedViews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => pageInput.parse(data))
  .handler(async ({ data, context }): Promise<{ views: SavedView[] }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("saved_views")
      .select("id, name, params, updated_at, user_id, shared_with_firm, created_by_email")
      .eq("page", data.page)
      .or(`user_id.eq.${context.userId},shared_with_firm.eq.true`)
      .order("shared_with_firm", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return { views: (rows ?? []) as SavedView[] };
  });

export const upsertSavedView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => upsertInput.parse(data))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const row: Record<string, unknown> = {
      user_id: context.userId,
      page: data.page,
      name: data.name,
      params: data.params ?? {},
      created_by_email: emailFromClaims(context.claims),
    };
    if (typeof data.shared_with_firm === "boolean") row.shared_with_firm = data.shared_with_firm;
    const { error } = await sb
      .from("saved_views")
      .upsert(row, { onConflict: "user_id,page,name" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setSavedViewSharing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => shareInput.parse(data))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { error } = await sb
      .from("saved_views")
      .update({ shared_with_firm: data.shared })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSavedView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => deleteInput.parse(data))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { error } = await sb
      .from("saved_views")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
