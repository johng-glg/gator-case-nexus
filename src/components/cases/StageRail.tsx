/**
 * StageRail — phase stepper for the SSDI lifecycle.
 *
 * Phase chips are buttons with a chevron; clicking expands that phase's sub-stages.
 * Active phase starts COLLAPSED (the status strip already shows the exact stage);
 * only one phase can be open at a time. Sub-stages are read-only — advancement
 * stays on the header "Advance stage" button.
 */
import { useState } from "react";
import { Check, ChevronDown, Circle, CircleDot } from "lucide-react";
import { PHASES, phaseIndex, type Stage } from "@/integrations/zoho/lifecycle";
import { cn } from "@/lib/utils";

export function StageRail({ current }: { current: string }) {
  const currentPhaseIdx = phaseIndex(current);
  const [openPhase, setOpenPhase] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {/* Phase stepper — each chip is a toggle button */}
      <ol className="flex items-center w-full gap-1">
        {PHASES.map((phase, i) => {
          const isDone = currentPhaseIdx > i;
          const isActive = currentPhaseIdx === i;
          const isUpcoming = currentPhaseIdx < i || currentPhaseIdx === -1;
          const isOpen = openPhase === phase.key;
          return (
            <li key={phase.key} className="flex items-center flex-1 last:flex-none min-w-0">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`stagerail-phase-${phase.key}`}
                onClick={() => setOpenPhase(isOpen ? null : phase.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] whitespace-nowrap min-w-0 w-full transition-colors",
                  "hover:bg-accent/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  isActive && "border-primary bg-primary/10 text-primary font-medium",
                  isDone && !isActive && "border-border bg-muted text-muted-foreground",
                  isUpcoming && "border-dashed border-border text-muted-foreground/70",
                )}
              >
                {isDone && <Check className="h-3 w-3 shrink-0" />}
                {isActive && <CircleDot className="h-3 w-3 shrink-0" />}
                {isUpcoming && <Circle className="h-3 w-3 shrink-0" />}
                <span className="truncate flex-1 text-left">{phase.label}</span>
                <ChevronDown
                  className={cn("h-3 w-3 shrink-0 transition-transform", isOpen && "rotate-180")}
                />
              </button>
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

      {/* Sub-stages for the currently expanded phase */}
      {openPhase && (() => {
        const phase = PHASES.find((p) => p.key === openPhase);
        if (!phase) return null;
        const idxInPhase = phase.stages.indexOf(current as Stage);
        return (
          <div
            id={`stagerail-phase-${openPhase}`}
            className="rounded-md border border-border bg-muted/20 px-3 py-2"
          >
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
              {phase.label}
            </div>
            <ul className="space-y-1">
              {phase.stages.map((s, i) => {
                const isCurrent = s === current;
                const isPast = idxInPhase >= 0 && i < idxInPhase;
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
        );
      })()}
    </div>
  );
}
