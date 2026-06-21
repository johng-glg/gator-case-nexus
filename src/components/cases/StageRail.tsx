import { Stage } from "@/integrations/zoho/lifecycle";
import { cn } from "@/lib/utils";

const STAGES: Stage[] = [
  "Intake",
  "Retainer signed",
  "Application filed",
  "Initial decision - pending",
  "Initial decision - denied",
  "Initial decision - approved",
  "Reconsideration filed",
  "Recon decision - pending",
  "Recon decision - denied",
  "Recon decision - approved",
  "ALJ hearing requested",
  "Hearing scheduled",
  "Hearing prep",
  "Hearing held",
  "ALJ decision - pending",
  "ALJ decision - denied",
  "ALJ decision - approved",
  "Appeals Council requested",
  "AC decision - pending",
  "AC decision - denied",
  "AC decision - approved",
  "Award / NOA received",
  "Fee petition filed",
  "Closed",
];

export function StageRail({ current }: { current: string }) {
  const currentIdx = STAGES.indexOf(current as Stage);
  return (
    <div className="overflow-x-auto -mx-2 px-2 py-2">
      <ol className="flex items-center gap-1 min-w-max">
        {STAGES.map((s, i) => {
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
              {i < STAGES.length - 1 && <div className="w-2 h-px bg-border mx-0.5" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
