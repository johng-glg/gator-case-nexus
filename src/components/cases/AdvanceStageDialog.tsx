import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TRANSITIONS, CLOSURE_REASONS, type Stage } from "@/integrations/zoho/lifecycle";

type FieldType = "date" | "text" | "number" | "textarea" | "select";
export interface FieldSpec {
  field: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: readonly string[];
}

/**
 * Stages that need extra data captured before they can be entered.
 * Keys map to SSDI_Cases API field names (zoho-api-contract.md).
 */
export const STAGE_REQUIREMENTS: Partial<Record<Stage, FieldSpec[]>> = {
  "Application filed": [
    { field: "Application_Filed_Date", label: "Application filed date", type: "date", required: true },
    { field: "SSA_Claim_Number", label: "SSA claim number", type: "text" },
  ],
  "Initial decision denied": [
    { field: "Notice_Date", label: "Notice date (printed on the adverse notice)", type: "date", required: true },
    { field: "Initial_Decision_Date", label: "Initial decision date", type: "date", required: true },
  ],
  "Initial decision approved": [
    { field: "Initial_Decision_Date", label: "Initial decision date", type: "date", required: true },
  ],
  "Reconsideration filed": [
    { field: "Recon_Filed_Date", label: "Reconsideration filed date", type: "date", required: true },
  ],
  "Recon decision denied": [
    { field: "Notice_Date", label: "Notice date", type: "date", required: true },
    { field: "Recon_Decision_Date", label: "Reconsideration decision date", type: "date", required: true },
  ],
  "Recon decision approved": [
    { field: "Recon_Decision_Date", label: "Reconsideration decision date", type: "date", required: true },
  ],
  "ALJ hearing requested": [
    { field: "ALJ_Hearing_Requested_Date", label: "ALJ hearing requested date", type: "date", required: true },
  ],
  "Hearing scheduled": [
    { field: "ALJ_Hearing_Scheduled_Date", label: "Hearing date (scheduled)", type: "date", required: true },
    { field: "Hearing_Type", label: "Hearing type (in-person / video / phone)", type: "text" },
    { field: "Hearing_Office_ODAR", label: "Hearing office / ODAR", type: "text" },
    { field: "ALJ_Name", label: "ALJ name", type: "text" },
  ],
  "Hearing held": [
    { field: "ALJ_Hearing_Held_Date", label: "Hearing held date", type: "date", required: true },
  ],
  "ALJ decision denied": [
    { field: "Notice_Date", label: "Notice date", type: "date", required: true },
    { field: "ALJ_Decision_Date", label: "ALJ decision date", type: "date", required: true },
  ],
  "ALJ decision approved": [
    { field: "ALJ_Decision_Date", label: "ALJ decision date", type: "date", required: true },
  ],
  "Appeals Council requested": [
    { field: "Appeals_Council_Requested_Date", label: "Appeals Council requested date", type: "date", required: true },
  ],
  "AC decision denied": [
    { field: "Notice_Date", label: "Notice date", type: "date", required: true },
    { field: "AC_Decision_Date", label: "Appeals Council decision date", type: "date", required: true },
  ],
  "AC decision approved": [
    { field: "AC_Decision_Date", label: "Appeals Council decision date", type: "date", required: true },
  ],
  "Award / NOA received": [
    { field: "Notice_of_Award_Date", label: "Notice of Award date", type: "date", required: true },
    { field: "Back_Pay_Amount", label: "Back pay amount (USD)", type: "number", required: true },
    { field: "Monthly_Benefit", label: "Monthly benefit (USD)", type: "number" },
    { field: "Entitlement_Date", label: "Entitlement date", type: "date" },
  ],
  "Fee petition filed": [
    { field: "Fee_Petition_Filed_Date", label: "Fee petition filed date", type: "date", required: true },
  ],
  "Closed": [
    { field: "Closure_Reason", label: "Closure reason", type: "select", required: true, options: CLOSURE_REASONS },
    { field: "Final_Disposition_Date", label: "Final disposition date", type: "date", required: true },
    { field: "Closure_Notes", label: "Closure notes", type: "textarea" },
  ],
};

const DENIED_STAGES = new Set<Stage>([
  "Initial decision denied",
  "Recon decision denied",
  "ALJ decision denied",
  "AC decision denied",
]);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStage: string;
  /** Optional: when set, the dialog opens with this next stage already selected. */
  initialStage?: Stage;
  /** Optional: prefill values keyed by field API name. */
  initialFields?: Record<string, string>;
  /** Optional: override the per-stage requirements map (e.g. with admin-edited values). */
  requirementsMap?: Partial<Record<Stage, FieldSpec[]>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSubmit: (toStage: Stage, fields: Record<string, any>) => Promise<void>;
}

export function AdvanceStageDialog({ open, onOpenChange, currentStage, initialStage, initialFields, requirementsMap, onSubmit }: Props) {
  const nextStages = (TRANSITIONS[currentStage as Stage] ?? []) as Stage[];
  const [selected, setSelected] = useState<Stage | "">(initialStage ?? "");
  const [fields, setFields] = useState<Record<string, string>>(initialFields ?? {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // When the dialog re-opens (e.g. from a banner), re-seed selection + prefill.
  useEffect(() => {
    if (open) {
      setSelected(initialStage ?? "");
      setFields(initialFields ?? {});
      setErr(null);
    }
  }, [open, initialStage, initialFields]);

  const effectiveMap = requirementsMap ?? STAGE_REQUIREMENTS;
  const requirements = selected ? effectiveMap[selected] ?? [] : [];

  async function submit() {
    if (!selected) return;
    setBusy(true);
    setErr(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: Record<string, any> = {};
      for (const r of requirements) {
        const raw = fields[r.field];
        if (raw === undefined || raw === "") continue;
        payload[r.field] = r.type === "number" ? Number(raw) : raw;
      }
      if (selected === "Closed") payload.Is_Closed = true;
      await onSubmit(selected, payload);
      onOpenChange(false);
      setSelected("");
      setFields({});
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Advance stage</DialogTitle>
          <DialogDescription>
            Current stage: <strong>{currentStage}</strong>. Choose the next stage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Next stage</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {nextStages.length === 0 && (
                <p className="text-sm text-muted-foreground">No valid transitions from this stage.</p>
              )}
              {nextStages.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setSelected(s); setFields({}); }}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    selected === s ? "bg-foreground text-background border-foreground" : "hover:bg-accent"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {requirements.length > 0 && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Required information</div>
              {requirements.map((r) => (
                <div key={r.field}>
                  <Label htmlFor={r.field} className="text-sm">
                    {r.label}{r.required && <span className="text-destructive"> *</span>}
                  </Label>
                  {r.type === "textarea" ? (
                    <Textarea
                      id={r.field}
                      value={fields[r.field] ?? ""}
                      onChange={(e) => setFields((f) => ({ ...f, [r.field]: e.target.value }))}
                      className="mt-1"
                    />
                  ) : r.type === "select" ? (
                    <Select
                      value={fields[r.field] ?? ""}
                      onValueChange={(v) => setFields((f) => ({ ...f, [r.field]: v }))}
                    >
                      <SelectTrigger id={r.field} className="mt-1">
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(r.options ?? []).map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={r.field}
                      type={r.type}
                      step={r.type === "number" ? "0.01" : undefined}
                      value={fields[r.field] ?? ""}
                      onChange={(e) => setFields((f) => ({ ...f, [r.field]: e.target.value }))}
                      className="mt-1"
                    />
                  )}
                </div>
              ))}
              {selected && DENIED_STAGES.has(selected) && (
                <p className="text-xs text-muted-foreground pt-1">
                  Enter the date printed on the SSA notice — the 60-day appeal deadline is computed from it.
                </p>
              )}
            </div>
          )}

          {(() => {
            const missing = requirements.filter((r) => r.required && !fields[r.field]);
            const showMissing = !!selected && missing.length > 0;
            return (
              <>
                {showMissing && (
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    Missing required: <strong>{missing.map((m) => m.label).join(", ")}</strong>
                  </p>
                )}
                {err && <p className="text-sm text-destructive">{err}</p>}
              </>
            );
          })()}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={
              !selected ||
              busy ||
              requirements.some((r) => r.required && !fields[r.field])
            }
          >
            {busy ? "Advancing…" : "Advance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
