import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { myRoles } from "@/lib/users.functions";
import { runDeadlineSweepNow } from "@/lib/zoho.functions";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Clock, FileWarning, TimerOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/deadline-sweep")({
  beforeLoad: ({ context }) => {
    const roles = (context as { roles?: string[] }).roles ?? [];
    if (!roles.includes("admin")) {
      throw redirect({ to: "/today" });
    }
  },
  component: DeadlineSweepPage,
});

interface DigestRow {
  id: string;
  ran_at: string;
  scanned: number;
  updated: number;
  overdue: DigestCase[];
  due_soon: DigestCase[];
  release_expiring: DigestCase[];
  stalled: StalledCase[];
  error: string | null;
  calendar_created: number | null;
  calendar_updated: number | null;
  calendar_deleted: number | null;
  calendar_errors: number | null;
}

interface DigestCase {
  id: string;
  caseNumber: string | null;
  engagementId: string | null;
  attorneyName: string | null;
  tier: string | null;
  date: string;
  days?: number;
  kind: "overdue" | "due_soon" | "release";
}

interface StalledCase {
  id: string;
  caseNumber: string | null;
  attorneyName: string | null;
  stage: string;
  daysInStage: number;
  slaDays: number;
  since: string;
}

function DeadlineSweepPage() {
  const fetchRoles = useServerFn(myRoles);
  const { data: roles = [] } = useQuery({ queryKey: ["my-roles"], queryFn: () => fetchRoles() });
  const isAdmin = roles.includes("admin");

  if (!isAdmin) {
    return <div className="text-sm text-muted-foreground">Admins only.</div>;
  }
  return <DeadlineSweepAdmin />;
}

function DeadlineSweepAdmin() {
  const qc = useQueryClient();
  const [items, setItems] = useState<DigestRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ssdi_deadline_digests")
      .select("id, ran_at, scanned, updated, overdue, due_soon, release_expiring, stalled, error, calendar_created, calendar_updated, calendar_deleted, calendar_errors")
      .order("ran_at", { ascending: false })
      .limit(20);
    if (error) toast.error(error.message);
    setItems((data ?? []) as unknown as DigestRow[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const runNow = useServerFn(runDeadlineSweepNow);
  const runMutation = useMutation({
    mutationFn: () => runNow(),
    onSuccess: async (r) => {
      toast.success(`Sweep complete — scanned ${r.scanned}, updated ${r.updated}`);
      await load();
      qc.invalidateQueries({ queryKey: ["zoho-query"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const latest = items[0];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-medium">SSDI Deadline Sweep</h2>
          <p className="text-sm text-muted-foreground">
            Runs nightly at 6:00 AM ET. Recomputes appeal deadlines, flags overdue cases, and
            logs the digest below.
          </p>
        </div>
        <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
          {runMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Run sweep now
        </Button>
      </div>

      {latest && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Stat label="Last run" value={new Date(latest.ran_at).toLocaleString()} />
          <Stat label="Cases scanned" value={String(latest.scanned)} />
          <Stat label="Overdue" value={String(latest.overdue?.length ?? 0)} tone={latest.overdue?.length ? "danger" : undefined} />
          <Stat label="Due ≤ 7 days" value={String(latest.due_soon?.length ?? 0)} tone={latest.due_soon?.length ? "warn" : undefined} />
        </div>
      )}

      {latest && !latest.error && (
        <div className="space-y-4">
          <CalendarSyncLine latest={latest} />
          <Section title="Overdue" icon={<AlertTriangle className="w-4 h-4 text-destructive" />} rows={latest.overdue ?? []} />
          <Section title="Due within 7 days" icon={<Clock className="w-4 h-4 text-amber-500" />} rows={latest.due_soon ?? []} />
          <Section title="Medical release expiring ≤ 30 days" icon={<FileWarning className="w-4 h-4 text-amber-500" />} rows={latest.release_expiring ?? []} />
        </div>
      )}

      <div>
        <h3 className="text-sm font-medium mb-2">Recent runs</h3>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-muted-foreground">No sweeps have run yet.</div>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">When</th>
                  <th className="text-right px-3 py-2">Scanned</th>
                  <th className="text-right px-3 py-2">Updated</th>
                  <th className="text-right px-3 py-2">Overdue</th>
                  <th className="text-right px-3 py-2">Due ≤7d</th>
                  <th className="text-right px-3 py-2">Release ≤30d</th>
                  <th className="text-left px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2">{new Date(r.ran_at).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.scanned}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.updated}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.overdue?.length ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.due_soon?.length ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.release_expiring?.length ?? 0}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.error ? <span className="text-destructive">Error: {r.error}</span> : <span className="text-muted-foreground">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" | "danger" }) {
  return (
    <div className={cn(
      "rounded-md border border-border px-3 py-2",
      tone === "danger" && "border-destructive/40 bg-destructive/5",
      tone === "warn" && "border-amber-500/40 bg-amber-500/5",
    )}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-medium tabular-nums">{value}</div>
    </div>
  );
}

function Section({ title, icon, rows }: { title: string; icon: React.ReactNode; rows: DigestCase[] }) {
  if (!rows.length) return null;
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-medium mb-2">{icon}{title} ({rows.length})</div>
      <div className="rounded-md border border-border divide-y divide-border">
        {rows.map((c) => (
          <div key={c.id} className="px-3 py-2 flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-3 min-w-0">
              <Link to="/practices/ssdi/cases/$caseId" params={{ caseId: c.id }} className="font-medium text-primary hover:underline truncate">
                {c.caseNumber ?? c.id}
              </Link>
              {c.tier && <span className="text-xs text-muted-foreground">{c.tier}</span>}
              {c.attorneyName && <span className="text-xs text-muted-foreground truncate">· {c.attorneyName}</span>}
            </div>
            <div className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
              {c.date}
              {typeof c.days === "number" && (
                <span className={cn("ml-2", c.days < 0 ? "text-destructive font-medium" : c.days <= 7 ? "text-amber-500 font-medium" : "")}>
                  {c.days < 0 ? `${Math.abs(c.days)}d overdue` : `${c.days}d left`}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarSyncLine({ latest }: { latest: DigestRow }) {
  const c = latest.calendar_created ?? 0;
  const u = latest.calendar_updated ?? 0;
  const d = latest.calendar_deleted ?? 0;
  const e = latest.calendar_errors ?? 0;
  if (c === 0 && u === 0 && d === 0 && e === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        Calendar sync: no changes on last run.
      </div>
    );
  }
  return (
    <div className="text-xs text-muted-foreground">
      Calendar sync: <span className="text-foreground tabular-nums">{c}</span> created ·{" "}
      <span className="text-foreground tabular-nums">{u}</span> updated ·{" "}
      <span className="text-foreground tabular-nums">{d}</span> deleted
      {e > 0 && (
        <span className="ml-2 text-destructive">· {e} error{e === 1 ? "" : "s"}</span>
      )}
    </div>
  );
}
