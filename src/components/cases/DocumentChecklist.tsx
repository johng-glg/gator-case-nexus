import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, FileText } from "lucide-react";
import { checklistForStage, type ChecklistDoc } from "@/integrations/zoho/documentChecklist";
import type { Stage } from "@/integrations/zoho/lifecycle";
import { cn } from "@/lib/utils";

type DocStatus = "todo" | "sent" | "received" | "filed";

interface CaseDocState {
  status: DocStatus;
  updatedAt: string;
}

const STATUSES: { value: DocStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "sent", label: "Sent" },
  { value: "received", label: "Received" },
  { value: "filed", label: "Filed" },
];

const STATUS_STYLES: Record<DocStatus, string> = {
  todo: "bg-muted text-muted-foreground border-border",
  sent: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  received: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
  filed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
};

function storageKey(caseId: string) {
  return `gator.ssdi.docs.${caseId}`;
}

function readState(caseId: string): Record<string, CaseDocState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(caseId));
    return raw ? (JSON.parse(raw) as Record<string, CaseDocState>) : {};
  } catch {
    return {};
  }
}

/**
 * Per-case document checklist. Required SSA/OHO documents are grouped by
 * lifecycle phase (Intake → Award) and each doc has a local status the user
 * can cycle through. State persists in localStorage scoped to the caseId —
 * no CRM writes, so it works without adding fields to Zoho.
 */
export function DocumentChecklist({ caseId, stage }: { caseId: string; stage: Stage }) {
  const groups = useMemo(() => checklistForStage(stage), [stage]);
  const [state, setState] = useState<Record<string, CaseDocState>>(() => readState(caseId));

  useEffect(() => {
    setState(readState(caseId));
  }, [caseId]);

  function setStatus(docKey: string, status: DocStatus) {
    setState((prev) => {
      const next = { ...prev, [docKey]: { status, updatedAt: new Date().toISOString() } };
      try {
        window.localStorage.setItem(storageKey(caseId), JSON.stringify(next));
      } catch {
        /* ignore quota errors */
      }
      return next;
    });
  }

  if (groups.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">
          Documents
        </div>
        <p className="text-sm text-muted-foreground">No documents tracked at this stage.</p>
      </section>
    );
  }

  const totals = groups.reduce(
    (acc, g) => {
      for (const d of g.docs) {
        acc.total += 1;
        const s = state[`${g.phaseKey}:${d.code}`]?.status ?? "todo";
        if (s === "filed") acc.filed += 1;
      }
      return acc;
    },
    { total: 0, filed: 0 },
  );

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Documents
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {totals.filed}/{totals.total} filed
        </div>
      </div>

      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.phaseKey}>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80 mb-1.5">
              {g.phaseLabel}
            </div>
            <ul className="divide-y divide-border rounded-md border border-border overflow-hidden">
              {g.docs.map((doc) => (
                <DocRow
                  key={`${g.phaseKey}:${doc.code}`}
                  doc={doc}
                  status={state[`${g.phaseKey}:${doc.code}`]?.status ?? "todo"}
                  updatedAt={state[`${g.phaseKey}:${doc.code}`]?.updatedAt}
                  onChange={(s) => setStatus(`${g.phaseKey}:${doc.code}`, s)}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Status is tracked locally on this device. Filing dates / artifacts still belong in Zoho.
      </p>
    </section>
  );
}

function DocRow({
  doc,
  status,
  updatedAt,
  onChange,
}: {
  doc: ChecklistDoc;
  status: DocStatus;
  updatedAt?: string;
  onChange: (s: DocStatus) => void;
}) {
  return (
    <li className="px-3 py-2.5 flex items-start gap-3">
      <div className="mt-0.5">
        {status === "filed" ? (
          <div className="h-5 w-5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 grid place-items-center">
            <Check className="h-3 w-3" />
          </div>
        ) : (
          <div className="h-5 w-5 rounded-full border border-dashed border-border grid place-items-center text-muted-foreground">
            <FileText className="h-3 w-3" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium text-sm text-foreground">{doc.code}</span>
          <span className="text-xs text-muted-foreground truncate">{doc.title}</span>
          {doc.url && (
            <a
              href={doc.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline"
            >
              PDF <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{doc.description}</p>
        {updatedAt && (
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
            Updated {new Date(updatedAt).toLocaleDateString()}
          </p>
        )}
      </div>
      <div className="flex gap-1 shrink-0 flex-wrap justify-end max-w-[180px]">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => onChange(s.value)}
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded border transition-colors",
              status === s.value
                ? STATUS_STYLES[s.value] + " font-medium"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
    </li>
  );
}
