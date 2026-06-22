/**
 * ActivityPanel — per-case timeline rendered from public.case_activity_log.
 *
 * Read-only. Auto-refreshes on cache invalidation triggered by any case mutation.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCaseActivity, type ActivityRow } from "@/lib/activity.functions";
import { History } from "lucide-react";

const ACTION_LABEL: Record<string, string> = {
  "stage.advance": "Stage advanced",
  "case.dates.update": "Case dates updated",
  "deadline.update": "Deadline updated",
  "cost.create": "Cost added",
  "cost.delete": "Cost deleted",
  "task.create": "Task created",
  "task.complete": "Task completed",
  "task.reopen": "Task re-opened",
  "task.reassign": "Task reassigned",
  "portal.invite": "Client portal invite",
  "document.request.create": "Document requested",
  "document.request.cancel": "Document request canceled",
  "document.upload": "Document uploaded",
  "message.sent": "Client email sent",
  "message.held": "Client email held",
  "message.discarded": "Client email discarded",
  "consent.update": "Client consent updated",
};

function actionColor(action: string): string {
  if (action.startsWith("stage.") || action === "case.dates.update")
    return "bg-primary/10 text-primary border-primary/30";
  if (action.startsWith("cost.")) return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30";
  if (action.startsWith("task.")) return "bg-muted text-foreground border-border";
  if (action === "portal.invite") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  if (action.startsWith("document.")) return "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30";
  if (action.startsWith("message.")) return "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30";
  if (action === "consent.update") return "bg-muted text-muted-foreground border-border";
  return "bg-muted text-muted-foreground border-border";
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export function ActivityPanel({
  caseId,
  engagementId,
}: {
  caseId: string;
  engagementId?: string;
}) {
  const fetchActivity = useServerFn(getCaseActivity);
  const q = useQuery({
    queryKey: ["case-activity", caseId, engagementId ?? null],
    queryFn: () => fetchActivity({ data: { caseId, engagementId, limit: 100 } }),
  });

  const rows: ActivityRow[] = q.data?.rows ?? [];

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-2">
          <History className="h-3.5 w-3.5" /> Activity
        </div>
        {rows.length > 0 && (
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Last {rows.length}
          </div>
        )}
      </div>

      {q.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {q.error && (
        <p className="text-xs text-destructive">{(q.error as Error).message}</p>
      )}
      {!q.isLoading && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
      )}

      <ol className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-start gap-3 rounded-md border border-border/60 bg-background/40 px-3 py-2"
          >
            <span
              className={`shrink-0 mt-0.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${actionColor(
                r.action,
              )}`}
            >
              {ACTION_LABEL[r.action] ?? r.action}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-foreground">{r.summary}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {formatWhen(r.created_at)}
                {r.actor_email ? ` · ${r.actor_email}` : ""}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
