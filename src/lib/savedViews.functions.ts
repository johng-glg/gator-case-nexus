/**
 * savedViews.functions.ts — per-user saved filter presets.
 *
 * Each row is scoped to (user_id, page, name). The browser passes `params` as
 * an opaque JSON object; pages decode it back into their local filter state.
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
}

const pageInput = z.object({ page: z.string().min(1).max(64) });
const upsertInput = z.object({
  page: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: z.any(),
});
const deleteInput = z.object({ id: z.string().uuid() });

export const listSavedViews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => pageInput.parse(data))
  .handler(async ({ data, context }): Promise<{ views: SavedView[] }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("saved_views")
      .select("id, name, params, updated_at")
      .eq("user_id", context.userId)
      .eq("page", data.page)
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
    const { error } = await sb
      .from("saved_views")
      .upsert(
        { user_id: context.userId, page: data.page, name: data.name, params: data.params ?? {} },
        { onConflict: "user_id,page,name" },
      );
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
