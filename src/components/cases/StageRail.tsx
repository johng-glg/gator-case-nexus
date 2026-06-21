import { useState } from "react";
import { Check, Circle, CircleDot, ChevronDown, ChevronRight } from "lucide-react";
import { PHASES, phaseIndex, type Stage } from "@/integrations/zoho/lifecycle";
import { cn } from "@/lib/utils";

const ALL_STAGES: Stage[] = PHASES.flatMap((p) => p.stages);

export function StageRail({ current }: { current: string }) {
  const currentPhaseIdx = phaseIndex(current);
  const [showFull, setShowFull] = useState(false);

  return (
    <div className="space-y-4">
      {/* Phase stepper */}
      <ol className="flex items-center w-full gap-1">
        {PHASES.map((phase, i) => {
          const isDone = currentPhaseIdx > i;
          const isActive = currentPhaseIdx === i;
          const isUpcoming = currentPhaseIdx < i || currentPhaseIdx === -1;
          return (
            <li key={phase.key} className="flex items-center flex-1 last:flex-none min-w-0">
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] whitespace-nowrap min-w-0",
                  isActive && "border-primary bg-primary/10 text-primary font-medium",
                  isDone && "border-border bg-muted text-muted-foreground",
                  isUpcoming && "border-dashed border-border text-muted-foreground/60",
                )}
              >
                {isDone && <Check className="h-3 w-3 shrink-0" />}
                {isActive && <CircleDot className="h-3 w-3 shrink-0" />}
                {isUpcoming && <Circle className="h-3 w-3 shrink-0" />}
                <span className="truncate">{phase.label}</span>
              </div>
              {i < PHASES.length - 1 && (
                <div
                  className={cn(
                    "h-px flex-1 mx-1 min-w-2",
                    currentPhaseIdx > i ? "bg-foreground/30" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Active phase sub-stages */}
      {currentPhaseIdx >= 0 && (
        <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
            {PHASES[currentPhaseIdx].label}
          </div>
          <ul className="space-y-1">
            {PHASES[currentPhaseIdx].stages.map((s) => {
              const phaseStages = PHASES[currentPhaseIdx].stages;
              const idxInPhase = phaseStages.indexOf(current as Stage);
              const thisIdx = phaseStages.indexOf(s);
              const isCurrent = s === current;
              const isPast = idxInPhase >= 0 && thisIdx < idxInPhase;
              return (
                <li key={s} className="flex items-center gap-2 text-xs">
                  {isPast && <Check className="h-3 w-3 text-muted-foreground" />}
                  {isCurrent && <CircleDot className="h-3 w-3 text-primary" />}
                  {!isPast && !isCurrent && <Circle className="h-3 w-3 text-muted-foreground/50" />}
                  <span
                    className={cn(
                      isCurrent && "font-semibold text-foreground",
                      isPast && "text-muted-foreground",
                      !isPast && !isCurrent && "text-muted-foreground/70",
                    )}
                  >
                    {s}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Full timeline disclosure */}
      <div>
        <button
          type="button"
          onClick={() => setShowFull((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {showFull ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {showFull ? "Hide full timeline" : "Show full timeline"}
        </button>
        {showFull && (
          <div className="overflow-x-auto mt-2 -mx-2 px-2 py-2">
            <ol className="flex items-center gap-1 min-w-max">
              {ALL_STAGES.map((s, i) => {
                const currentIdx = ALL_STAGES.indexOf(current as Stage);
                const isCurrent = i === currentIdx;
                const isPast = currentIdx >= 0 && i < currentIdx;
                return (
                  <li key={s} className="flex items-center">
                    <div
                      className={cn(
                        "rounded-md border px-2 py-1 text-[11px] whitespace-nowrap",
                        isCurrent && "border-foreground bg-foreground text-background font-medium",
                        isPast && "border-muted bg-muted text-muted-foreground",
                        !isCurrent && !isPast && "border-dashed text-muted-foreground/70",
                      )}
                    >
                      {s}
                    </div>
                    {i < ALL_STAGES.length - 1 && <div className="w-2 h-px bg-border mx-0.5" />}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
