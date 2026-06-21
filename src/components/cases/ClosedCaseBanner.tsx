import { Lock } from "lucide-react";

interface Props {
  closureReason?: string | null;
  closureDate?: string | null;
}

/**
 * Read-only banner shown when a case is in the Closed stage. Edit lock applies
 * to stage / SSA data; Notes and Costs remain editable per firm policy.
 */
export function ClosedCaseBanner({ closureReason, closureDate }: Props) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-muted-foreground/20 bg-muted/40 p-3">
      <Lock className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="text-sm">
        <div className="font-medium">Case closed</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {closureReason ? <>Reason: <strong>{closureReason}</strong>{closureDate ? ` · ${closureDate}` : ""}</> : "Stage edits are locked. Notes and Cost entries remain editable."}
        </div>
      </div>
    </div>
  );
}
