import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/rbac";

const FieldSpecSchema = z.object({
  field: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["date", "text", "number", "textarea", "select"]),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
});

export type StoredFieldSpec = z.infer<typeof FieldSpecSchema>;

const SaveInputSchema = z.object({
  stage: z.string().min(1),
  fields: z.array(FieldSpecSchema),
});

/** List all stored overrides. Admin-only via RLS. */
export const listStageRequirementOverrides = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ssdi_stage_requirements")
      .select("stage,fields,updated_at");
    if (error) throw new Error(error.message);
    const map: Record<string, { fields: StoredFieldSpec[]; updated_at: string }> = {};
    for (const row of data ?? []) {
      map[row.stage] = {
        fields: (row.fields as StoredFieldSpec[]) ?? [],
        updated_at: row.updated_at,
      };
    }
    return map;
  });

/** Upsert one stage's requirement list. Admin-only via RLS. */
export const saveStageRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SaveInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any, "saveStageRequirements");
    const { error } = await context.supabase
      .from("ssdi_stage_requirements")
      .upsert(
        { stage: data.stage, fields: data.fields, updated_by: context.userId },
        { onConflict: "stage" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Delete a stored override, reverting that stage to the code defaults. */
export const resetStageRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ stage: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any, "resetStageRequirements");
    const { error } = await context.supabase
      .from("ssdi_stage_requirements")
      .delete()
      .eq("stage", data.stage);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
