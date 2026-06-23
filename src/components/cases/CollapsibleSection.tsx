/**
 * CollapsibleSection — wraps a panel so empty cases collapse to a one-line summary
 * with optional action, expanded sections show full content.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  title: string;
  isEmpty: boolean;
  emptyLine?: string;
  emptyAction?: ReactNode;
  /** Force open regardless of `isEmpty`. */
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  isEmpty,
  emptyLine,
  emptyAction,
  defaultOpen,
  children,
}: Props) {
  const startOpen = defaultOpen ?? !isEmpty;
  const [open, setOpen] = useState(startOpen);

  if (isEmpty && !open) {
    return (
      <section className="rounded-lg border border-dashed border-border/70 bg-card/40 px-4 py-2.5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-xs uppercase tracking-[0.18em]">{title}</span>
          {emptyLine && <span className="text-xs">— {emptyLine}</span>}
        </button>
        {emptyAction}
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title}
      </button>
      {open && <div>{children}</div>}
    </section>
  );
}
