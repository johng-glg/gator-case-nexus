import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { STAGE_REQUIREMENTS, type FieldSpec } from "@/components/cases/AdvanceStageDialog";
import { CLOSURE_REASONS, TRANSITIONS, type Stage } from "@/integrations/zoho/lifecycle";
import { useStageRequirements } from "@/hooks/use-stage-requirements";
import { saveStageRequirements, resetStageRequirements } from "@/lib/stage-requirements.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Plus, Trash2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/stage-requirements")({
  head: () => ({ meta: [{ title: "Stage requirements — Gator" }] }),
  component: StageRequirementsPage,
});

const FIELD_TYPES = ["date", "text", "number", "textarea", "select"] as const;
type FieldType = typeof FIELD_TYPES[number];

function StageRequirementsPage() {
  const stages = useMemo(() => Object.keys(TRANSITIONS) as Stage[], []);
  const { requirements, overrides, refetch } = useStageRequirements();
  const [selectedStage, setSelectedStage] = useState<Stage>(stages[0]);
  const [draft, setDraft] = useState<FieldSpec[]>([]);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const save = useServerFn(saveStageRequirements);
  const reset = useServerFn(resetStageRequirements);

  // Seed the draft from current merged requirements whenever the stage changes.
  useEffect(() => {
    setDraft((requirements[selectedStage] ?? []).map((f) => ({ ...f })));
  }, [selectedStage, requirements]);

  const isOverridden = Boolean(overrides[selectedStage]);
  const hasCodeDefault = Boolean(STAGE_REQUIREMENTS[selectedStage]);

  function updateField(idx: number, patch: Partial<FieldSpec>) {
    setDraft((d) => d.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }
  function removeField(idx: number) {
    setDraft((d) => d.filter((_, i) => i !== idx));
  }
  function addField() {
    setDraft((d) => [...d, { field: "", label: "", type: "text", required: false }]);
  }

  async function onSave() {
    // Validate
    for (const f of draft) {
      if (!f.field.trim() || !f.label.trim()) {
        toast.error("Each field needs an API name and a label.");
        return;
      }
      if (f.type === "select" && (!f.options || f.options.length === 0)) {
        toast.error(`"${f.label}" is a select but has no options.`);
        return;
      }
    }
    setBusy(true);
    try {
      await save({ data: { stage: selectedStage, fields: draft } });
      toast.success(`Saved requirements for "${selectedStage}".`);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["stage-requirement-overrides"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    if (!confirm(`Revert "${selectedStage}" to the built-in defaults?`)) return;
    setBusy(true);
    try {
      await reset({ data: { stage: selectedStage } });
      toast.success(`Reverted "${selectedStage}" to defaults.`);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["stage-requirement-overrides"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-medium">Per-stage required fields</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Edit the fields the Advance dialog asks for when a case enters each stage.
          Changes apply immediately to every user. Field API names must match Zoho
          SSDI_Cases module fields exactly.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        {/* Stage list */}
        <div className="rounded-lg border border-border bg-card divide-y divide-border max-h-[70vh] overflow-auto">
          {stages.map((s) => {
            const count = (requirements[s] ?? []).length;
            const customized = Boolean(overrides[s]);
            return (
              <button
                key={s}
                onClick={() => setSelectedStage(s)}
                className={`w-full text-left p-3 text-sm transition-colors ${
                  selectedStage === s ? "bg-accent" : "hover:bg-accent/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{s}</span>
                  {customized && (
                    <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-900 dark:text-amber-200">
                      edited
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {count === 0 ? "no fields" : `${count} field${count === 1 ? "" : "s"}`}
                </div>
              </button>
            );
          })}
        </div>

        {/* Editor */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <div className="font-medium">{selectedStage}</div>
              <div className="text-xs text-muted-foreground">
                {isOverridden
                  ? "Customized — overriding the built-in defaults."
                  : hasCodeDefault
                  ? "Using built-in defaults."
                  : "No defaults — stage has no required fields out of the box."}
              </div>
            </div>
            <div className="flex gap-2">
              {isOverridden && (
                <Button variant="ghost" size="sm" onClick={onReset} disabled={busy}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Revert
                </Button>
              )}
              <Button size="sm" onClick={onSave} disabled={busy}>
                <Save className="h-3.5 w-3.5 mr-1" /> Save
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {draft.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No fields. Add one below.</p>
            )}
            {draft.map((f, i) => (
              <FieldRow
                key={i}
                spec={f}
                onChange={(patch) => updateField(i, patch)}
                onRemove={() => removeField(i)}
              />
            ))}
            <Button variant="outline" size="sm" onClick={addField}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add field
            </Button>
          </div>

          {selectedStage === "Closed" && (
            <p className="text-xs text-muted-foreground border-t pt-2">
              Tip: the built-in Closure reason picklist uses{" "}
              <code className="rounded bg-muted px-1">{CLOSURE_REASONS.join(", ")}</code>.
              You can extend it via the "options" list on a select field.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  spec,
  onChange,
  onRemove,
}: {
  spec: FieldSpec;
  onChange: (patch: Partial<FieldSpec>) => void;
  onRemove: () => void;
}) {
  const optionsText = (spec.options ?? []).join(", ");
  return (
    <div className="rounded-md border border-border p-3 space-y-2 bg-background">
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <Label className="text-xs">API name (Zoho field)</Label>
          <Input
            value={spec.field}
            onChange={(e) => onChange({ field: e.target.value })}
            placeholder="e.g. Application_Filed_Date"
            className="mt-1 font-mono text-xs"
          />
        </div>
        <div>
          <Label className="text-xs">Label (shown to user)</Label>
          <Input
            value={spec.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="e.g. Application filed date"
            className="mt-1"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-32">
          <Label className="text-xs">Type</Label>
          <Select value={spec.type} onValueChange={(v) => onChange({ type: v as FieldType })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input
            type="checkbox"
            checked={Boolean(spec.required)}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          Required
        </label>
        <div className="ml-auto">
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
      {spec.type === "select" && (
        <div>
          <Label className="text-xs">Options (comma-separated)</Label>
          <Input
            value={optionsText}
            onChange={(e) =>
              onChange({
                options: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="Won, Lost, Withdrawn"
            className="mt-1"
          />
        </div>
      )}
    </div>
  );
}
