import { createFileRoute } from "@tanstack/react-router";
import { STAGE_REQUIREMENTS } from "@/components/cases/AdvanceStageDialog";
import { TRANSITIONS, type Stage } from "@/integrations/zoho/lifecycle";
import { ClipboardList } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/stage-requirements")({
  head: () => ({ meta: [{ title: "Stage requirements — Gator" }] }),
  component: StageRequirementsPage,
});

/**
 * Phase 2.1 placeholder — surfaces the current per-stage required fields and
 * known gaps so admins can see what the Advance dialog will ask for at each
 * transition. This page is a to-do board, not a configuration editor (yet).
 */
function StageRequirementsPage() {
  const stages = Object.keys(TRANSITIONS) as Stage[];

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-medium">Per-stage required fields</h2>
          <span className="ml-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-900 dark:text-amber-200">
            Phase 2.1 · in progress
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Snapshot of the fields the Advance dialog requires when a case enters
          each stage. Editing these is on the to-do list — for now, changes are
          made in <code className="rounded bg-muted px-1">src/components/cases/AdvanceStageDialog.tsx</code>.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {stages.map((s) => {
          const reqs = STAGE_REQUIREMENTS[s] ?? [];
          return (
            <div key={s} className="p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div className="font-medium">{s}</div>
                <div className="text-xs text-muted-foreground">
                  {reqs.length === 0 ? "No required fields" : `${reqs.length} field${reqs.length === 1 ? "" : "s"}`}
                </div>
              </div>
              {reqs.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {reqs.map((r) => (
                    <li key={r.field} className="flex items-baseline gap-2">
                      <code className="rounded bg-muted px-1 text-xs">{r.field}</code>
                      <span className="text-muted-foreground">{r.label}</span>
                      {r.required && <span className="text-[11px] uppercase tracking-wide text-destructive">required</span>}
                      <span className="ml-auto text-[11px] uppercase tracking-wide text-muted-foreground">{r.type}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-dashed border-muted-foreground/30 p-4 text-sm text-muted-foreground">
        <div className="font-medium text-foreground mb-1">To do</div>
        <ul className="list-disc pl-5 space-y-1">
          <li>Make this page editable (admin can add / remove fields per stage without a code change).</li>
          <li>Add field-type validation rules (e.g. format, min/max) and inline help text.</li>
          <li>Sync the schema to Zoho field metadata so renamed fields surface here automatically.</li>
        </ul>
      </div>
    </div>
  );
}
