import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { STAGE_REQUIREMENTS, type FieldSpec } from "@/components/cases/AdvanceStageDialog";
import type { Stage } from "@/integrations/zoho/lifecycle";
import { listStageRequirementOverrides } from "@/lib/stage-requirements.functions";

/**
 * Returns the merged per-stage required-fields map: DB overrides win over the
 * code defaults in STAGE_REQUIREMENTS. If the user is not an admin (RLS hides
 * the overrides), this falls back to the code defaults silently.
 */
export function useStageRequirements() {
  const fetchOverrides = useServerFn(listStageRequirementOverrides);
  const q = useQuery({
    queryKey: ["stage-requirement-overrides"],
    queryFn: () => fetchOverrides(),
    staleTime: 60_000,
    retry: false,
  });

  const overrides = q.data ?? {};
  const merged: Partial<Record<Stage, FieldSpec[]>> = { ...STAGE_REQUIREMENTS };
  for (const [stage, row] of Object.entries(overrides)) {
    merged[stage as Stage] = row.fields as FieldSpec[];
  }
  return { requirements: merged, overrides, isLoading: q.isLoading, refetch: q.refetch };
}
