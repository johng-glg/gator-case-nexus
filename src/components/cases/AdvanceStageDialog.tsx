import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { TRANSITIONS, type Stage } from "@/integrations/zoho/lifecycle";

/**
 * Stages that need extra data captured before they can be entered.
 * Keys here map to SSDI_Cases API field names (zoho-api-contract.md).
 */
const STAGE_REQUIREMENTS: Partial<Record<Stage, { field: string; label: string; type: "date" }[]>> = {
  "Initial decision - denied": [
    { field: "Notice_Date", label: "Notice date (printed on the adverse notice)", type: "date" },
    { field: "Initial_Decision_Date", label: "Initial decision date", type: "date" },
  ],
  "Initial decision - approved": [
    { field: "Initial_Decision_Date", label: "Initial decision date", type: "date" },
  ],
  "Recon decision - denied": [
    { field: "Notice_Date", label: "Notice date", type: "date" },
    { field: "Recon_Decision_Date", label: "Reconsideration decision date", type: "date" },
  ],
  "Recon decision - approved": [
    { field: "Recon_Decision_Date", label: "Reconsideration decision date", type: "date" },
  ],
  "ALJ decision - denied": [
    { field: "Notice_Date", label: "Notice date", type: "date" },
    { field: "ALJ_Decision_Date", label: "ALJ decision date", type: "date" },
  ],
  "ALJ decision - approved": [
    { field: "ALJ_Decision_Date", label: "ALJ decision date", type: "date" },
  ],
  "AC decision - denied": [
    { field: "Notice_Date", label: "Notice date", type: "date" },
  ],
  "Hearing scheduled": [
    { field: "ALJ_Hearing_Scheduled_Date", label: "Hearing date/time (scheduled)", type: "date" },
  ],
  "Award / NOA received": [
    { field: "Notice_of_Award_Date", label: "Notice of Award date", type: "date" },
  ],
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStage: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSubmit: (toStage: Stage, fields: Record<string, any>) => Promise<void>;
}

export function AdvanceStageDialog({ open, onOpenChange, currentStage, onSubmit }: Props) {
  const nextStages = (TRANSITIONS[currentStage as Stage] ?? []) as Stage[];
  const [selected, setSelected] = useState<Stage | "">("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const requirements = selected ? STAGE_REQUIREMENTS[selected] ?? [] : [];

  async function submit() {
    if (!selected) return;
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(selected, fields);
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
                  <Label htmlFor={r.field} className="text-sm">{r.label}</Label>
                  <Input
                    id={r.field}
                    type={r.type}
                    value={fields[r.field] ?? ""}
                    onChange={(e) => setFields((f) => ({ ...f, [r.field]: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              ))}
            </div>
          )}

          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={
              !selected ||
              busy ||
              requirements.some((r) => !fields[r.field])
            }
          >
            {busy ? "Advancing…" : "Advance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
