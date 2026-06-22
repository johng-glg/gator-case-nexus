/**
 * Settings → Activity Log — firm-wide audit feed of every case mutation.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFirmActivity, type ActivityRow } from "@/lib/activity.functions";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { downloadCsv, toCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/activity")({
  head: () => ({ meta: [{ title: "Activity log — Gator" }] }),
  component: ActivityLogPage,
});

const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "stage.advance", label: "Stage advanced" },
  { value: "case.dates.update", label: "Case dates updated" },
  { value: "cost.create", label: "Cost added" },
  { value: "cost.delete", label: "Cost deleted" },
  { value: "task.create", label: "Task created" },
  { value: "task.complete", label: "Task completed" },
  { value: "task.reopen", label: "Task re-opened" },
  { value: "task.reassign", label: "Task reassigned" },
  { value: "portal.invite", label: "Client portal invite" },
  { value: "document.request.create", label: "Document requested" },
  { value: "document.request.cancel", label: "Document request canceled" },
  { value: "document.upload", label: "Document uploaded" },
  { value: "message.sent", label: "Client email sent" },
  { value: "message.held", label: "Client email held for review" },
  { value: "message.discarded", label: "Client email discarded" },
  { value: "consent.update", label: "Client consent updated" },
];

function actionLabel(a: string): string {
  return ACTION_OPTIONS.find((o) => o.value === a)?.label ?? a;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function ActivityLogPage() {
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [search, setSearch] = useState("");

  const fetchActivity = useServerFn(getFirmActivity);
  const q = useQuery({
    queryKey: ["firm-activity", action, actor],
    queryFn: () =>
      fetchActivity({
        data: {
          limit: 300,
          ...(action ? { action } : {}),
          ...(actor.trim() ? { actorEmail: actor.trim() } : {}),
        },
      }),
  });

  const rows = q.data?.rows ?? [];
  const filtered = useMemo<ActivityRow[]>(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        r.summary.toLowerCase().includes(term) ||
        (r.case_id ?? "").toLowerCase().includes(term) ||
        (r.actor_email ?? "").toLowerCase().includes(term),
    );
  }, [rows, search]);

  function exportCsv() {
    const data = filtered.map((r) => [
      r.created_at,
      r.actor_email ?? "",
      actionLabel(r.action),
      r.summary,
      r.case_id ?? "",
      r.engagement_id ?? "",
    ]);
    downloadCsv(
      `activity-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(["When", "Actor", "Action", "Summary", "Case", "Engagement"], data),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl">Activity log</h2>
          <p className="text-sm text-muted-foreground">
            Every staff-side change to an SSDI case. Read-only.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="text-sm">
          <span className="text-xs text-muted-foreground">Action</span>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-input px-2 py-1.5 text-sm"
          >
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-xs text-muted-foreground">Actor email</span>
          <Input
            type="email"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="anyone@gatorlawpc.com"
            className="mt-1"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs text-muted-foreground">Search summary / case</span>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. SSDI-0042"
            className="mt-1"
          />
        </label>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">When</th>
              <th className="px-3 py-2 text-left font-medium">Actor</th>
              <th className="px-3 py-2 text-left font-medium">Action</th>
              <th className="px-3 py-2 text-left font-medium">Summary</th>
              <th className="px-3 py-2 text-left font-medium">Case</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {q.isLoading && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {q.error && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-destructive">{(q.error as Error).message}</td></tr>
            )}
            {!q.isLoading && filtered.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No activity matches.</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-accent/30">
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatWhen(r.created_at)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.actor_email ?? "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">{actionLabel(r.action)}</td>
                <td className="px-3 py-2">{r.summary}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.case_id ? (
                    <Link
                      to="/practices/ssdi/cases/$caseId"
                      params={{ caseId: r.case_id }}
                      className="text-primary hover:underline"
                    >
                      {r.case_id.slice(-8)}
                    </Link>
                  ) : r.engagement_id ? (
                    <span className="text-muted-foreground">eng {r.engagement_id.slice(-8)}</span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
