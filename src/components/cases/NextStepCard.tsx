/**
 * NextStepCard — renders the "what to do next" card when no appeal clock is running.
 * Replaces the empty "no deadline computed" Deadline panel at Retained.
 */
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  title: string;
  description: string;
  cta?: { label: string; onClick: () => void };
  requiredFields?: string[];
}

export function NextStepCard({ title, description, cta, requiredFields }: Props) {
  return (
    <section className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-primary">
        <Sparkles className="h-3 w-3" /> Next step
      </div>
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {requiredFields && requiredFields.length > 0 && (
        <div className="text-xs">
          <div className="text-muted-foreground uppercase tracking-wider mb-1">Required to advance</div>
          <ul className="space-y-0.5">
            {requiredFields.map((f) => (
              <li key={f} className="text-foreground">• {f}</li>
            ))}
          </ul>
        </div>
      )}
      {cta && (
        <Button size="sm" onClick={cta.onClick}>
          {cta.label} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      )}
    </section>
  );
}
