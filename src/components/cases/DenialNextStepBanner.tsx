import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DENIAL_NEXT_STEP, type Stage } from "@/integrations/zoho/lifecycle";

interface Props {
  stage: Stage;
  deadline: string | null;
  daysRemaining: number | null;
  onAct: (nextStage: Stage, prefill: Record<string, string>) => void;
}

/**
 * Shown above the Stage Rail whenever the case is sitting on a denial stage.
 * One-click button opens the Advance dialog preselected to the next-tier filing
 * stage, with that stage's date field prefilled to today (attorney can adjust).
 */
export function DenialNextStepBanner({ stage, deadline, daysRemaining, onAct }: Props) {
  const step = DENIAL_NEXT_STEP[stage];
  if (!step) return null;

  const overdue = daysRemaining !== null && daysRemaining < 0;
  const urgent = daysRemaining !== null && daysRemaining <= 14;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 ${
        overdue
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : urgent
            ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
            : "border-primary/30 bg-primary/5"
      }`}
    >
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0 text-sm">
        <div className="font-medium">{step.label}</div>
        <div className="text-xs opacity-80 mt-0.5">
          {deadline
            ? `Deadline ${deadline}${
                daysRemaining !== null
                  ? overdue
                    ? ` (overdue by ${Math.abs(daysRemaining)} days)`
                    : ` (${daysRemaining} days left)`
                  : ""
              }`
            : "Enter the SSA notice date to compute the appeal deadline."}
        </div>
      </div>
      <Button
        size="sm"
        variant={overdue || urgent ? "default" : "outline"}
        onClick={() => onAct(step.nextStage, { [step.dateField]: today })}
      >
        {step.label}
      </Button>
    </div>
  );
}
