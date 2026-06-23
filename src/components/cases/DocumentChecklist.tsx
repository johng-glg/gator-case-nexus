import { useMemo } from "react";
import { Check, ExternalLink, FileText, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCaseDocuments, setDocumentStatus } from "@/lib/caseDocuments.functions";
import { DOC_STATUSES, type DocStatus } from "@/integrations/zoho/documents";
import { PHASES, type Stage } from "@/integrations/zoho/lifecycle";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<DocStatus, string> = {
  "To do": "bg-muted text-muted-foreground border-border",
  Sent: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  Received: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
  Filed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
};

type DocRow = {
  code: string;
  label: string;
  phase: string;
  url?: string;
  required: boolean;
  status: DocStatus;
  updatedAt?: string;
};

/**
 * Per-case document checklist. The list comes from the engine
 * (`documentsThroughStage`) — phase groups appear as the case advances and
 * stay visible thereafter. Status is firm-wide and durable: every change
 * upserts `case_document_status` and writes a `case_activity_log` entry.
 *
 * `excludeCodes` lets the parent hide rows already rendered elsewhere (e.g.
 * the SSA intake forms which live in FormsAndDocumentsPanel).
 */
export function DocumentChecklist({
  caseId,
  stage,
  excludeCodes,
}: {
  caseId: string;
  stage: Stage;
  excludeCodes?: string[];
}) {
  const listFn = useServerFn(listCaseDocuments);
  const setFn = useServerFn(setDocumentStatus);
  const queryClient = useQueryClient();

  const queryKey = ["case-docs", caseId, stage] as const;

  const exclude = new Set(excludeCodes ?? []);
  const q = useQuery({
    queryKey,
    queryFn: async () => {
      const rows = await listFn({ data: { caseId, currentStage: stage } });
      return exclude.size ? rows.filter((r: DocRow) => !exclude.has(r.code)) : rows;
    },
  });

  const mutation = useMutation({
    mutationFn: (vars: { docCode: string; status: DocStatus }) =>
      setFn({ data: { caseId, docCode: vars.docCode, status: vars.status } }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<DocRow[]>(queryKey);
      if (prev) {
        queryClient.setQueryData<DocRow[]>(
          queryKey,
          prev.map((r) =>
            r.code === vars.docCode
              ? { ...r, status: vars.status, updatedAt: new Date().toISOString() }
              : r,
          ),
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["case-activity", caseId] });
    },
  });

  const grouped = useMemo(() => {
    const rows = q.data ?? [];
    const byPhase = new Map<string, DocRow[]>();
    for (const r of rows) {
      const arr = byPhase.get(r.phase) ?? [];
      arr.push(r);
      byPhase.set(r.phase, arr);
    }
    return PHASES.filter((p) => byPhase.has(p.key)).map((p) => ({
      key: p.key,
      label: p.label,
      docs: byPhase.get(p.key)!,
    }));
  }, [q.data]);

  const totals = useMemo(() => {
    const rows = q.data ?? [];
    return rows.reduce(
      (acc, r) => {
        acc.total += 1;
        if (r.status === "Filed") acc.filed += 1;
        return acc;
      },
      { total: 0, filed: 0 },
    );
  }, [q.data]);

  if (q.isLoading) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Documents</div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading checklist…
        </div>
      </section>
    );
  }

  if (q.error) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Documents</div>
        <p className="text-sm text-destructive">{(q.error as Error).message}</p>
      </section>
    );
  }

  if (grouped.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Documents</div>
        <p className="text-sm text-muted-foreground">No documents tracked at this stage.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Documents</div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {totals.filed}/{totals.total} filed
        </div>
      </div>

      <div className="space-y-4">
        {grouped.map((g) => {
          const filed = g.docs.filter((d) => d.status === "Filed").length;
          return (
            <div key={g.key}>
              <div className="flex items-baseline justify-between mb-1.5">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
                  {g.label}
                </div>
                <div className="text-[10px] text-muted-foreground/70 tabular-nums">
                  {filed}/{g.docs.length} filed
                </div>
              </div>
              <ul className="divide-y divide-border rounded-md border border-border overflow-hidden">
                {g.docs.map((doc) => (
                  <DocRowView
                    key={doc.code}
                    doc={doc}
                    pending={mutation.isPending && mutation.variables?.docCode === doc.code}
                    onChange={(s) => mutation.mutate({ docCode: doc.code, status: s })}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Status is shared across the firm. Every change is recorded in the case activity log.
      </p>
    </section>
  );
}

function DocRowView({
  doc,
  pending,
  onChange,
}: {
  doc: DocRow;
  pending: boolean;
  onChange: (s: DocStatus) => void;
}) {
  return (
    <li className="px-3 py-2.5 flex items-start gap-3">
      <div className="mt-0.5">
        {doc.status === "Filed" ? (
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
          <span className="text-xs text-muted-foreground truncate">{doc.label}</span>
          {doc.required && (
            <span className="text-[10px] uppercase tracking-wider rounded border border-border bg-muted/40 text-muted-foreground px-1 py-px">
              required
            </span>
          )}
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
        {doc.updatedAt && (
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
            Updated {new Date(doc.updatedAt).toLocaleDateString()}
          </p>
        )}
      </div>
      <div className="flex gap-1 shrink-0 flex-wrap justify-end max-w-[200px]">
        {DOC_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            disabled={pending}
            onClick={() => onChange(s)}
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded border transition-colors disabled:opacity-60",
              doc.status === s
                ? STATUS_STYLES[s] + " font-medium"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </li>
  );
}
