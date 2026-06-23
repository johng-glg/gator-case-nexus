/**
 * /today — personal command center ("My day" workload dashboard).
 *
 * Cards (each: count + top 5 + deep-link), all scoped to the signed-in user:
 *   1. My deadlines (next 14 days, red ≤3d / amber ≤7d)
 *   2. My tasks due today/overdue (inline complete)
 *   3. Upcoming hearings (next 14 days)
 *   4. Leads to qualify (Convert shortcut)
 *   5. Retainers awaiting signature (Sent)
 *
 * All reads use existing whitelisted COQL queries — no engine work.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zohoQuery, completeTask } from "@/lib/zoho.functions";
import {
  AlarmClock, Gavel, Sun, CheckCircle2, UserPlus, FileSignature, ListTodo, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({ meta: [{ title: "Today — Gator" }] }),
  component: TodayPage,
});

type Row = Record<string, unknown>;

function asStr(v: unknown) { return v == null ? "" : String(v); }
function lookupId(v: unknown) {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v && "id" in (v as object)) return String((v as { id?: unknown }).id ?? "");
  return "";
}
function daysFromToday(iso: string): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y) return null;
  const due = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((due - today) / 86_400_000);
}

function TodayPage() {
  const runQuery = useServerFn(zohoQuery);

  const myDeadlines = useQuery({
    queryKey: ["today", "myDeadlines"],
    queryFn: () => runQuery({ data: { name: "myDeadlines" } }),
  });
  const hearings = useQuery({
    queryKey: ["today", "myUpcomingHearings"],
    queryFn: () => runQuery({ data: { name: "myUpcomingHearings" } }),
  });
  const tasks = useQuery({
    queryKey: ["today", "myOpenTasks"],
    queryFn: () => runQuery({ data: { name: "myOpenTasks" } }),
  });
  const leads = useQuery({
    queryKey: ["today", "leadsToQualify"],
    queryFn: () => runQuery({ data: { name: "leadsToQualify" } }),
  });
  const retainers = useQuery({
    queryKey: ["today", "pendingRetainers"],
    queryFn: () => runQuery({ data: { name: "pendingRetainers" } }),
  });

  const rows = <T,>(q: { data?: unknown }) =>
    (((q.data as { rows?: T[] } | undefined)?.rows) ?? []) as T[];

  const deadlines = rows<Row>(myDeadlines)
    .map((r) => ({ row: r, days: daysFromToday(asStr(r.Deadline_Date)) }))
    .filter((x) => x.days !== null && (x.days as number) <= 14)
    .sort((a, b) => (a.days! - b.days!));

  const upcoming = rows<Row>(hearings)
    .map((r) => ({ row: r, days: daysFromToday(asStr(r.ALJ_Hearing_Scheduled_Date)) }))
    .filter((x) => x.days !== null && (x.days as number) >= 0 && (x.days as number) <= 14)
    .sort((a, b) => (a.days! - b.days!));

  const dueTasks = rows<Row>(tasks)
    .map((r) => ({ row: r, days: daysFromToday(asStr(r.Due_Date)) }))
    .filter((x) => x.days === null || (x.days as number) <= 0)
    .sort((a, b) => ((a.days ?? 0) - (b.days ?? 0)));

  const leadQueue = rows<Row>(leads).slice(0);

  const STALE_DAYS = 3;
  const pendingRet = rows<Row>(retainers)
    .map((r) => {
      const mod = asStr(r.Modified_Time);
      const ageDays = mod ? Math.max(0, -1 * (daysFromToday(mod) ?? 0)) : null;
      return { row: r, ageDays };
    })
    .filter((x) => x.ageDays === null || x.ageDays >= STALE_DAYS)
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <header className="flex items-center gap-3">
        <Sun className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Today</h1>
          <p className="text-sm text-muted-foreground">
            Your day at a glance. Press <kbd className="rounded border bg-muted px-1 text-xs">⌘K</kbd> to jump anywhere.
          </p>
        </div>
      </header>

      <Section icon={AlarmClock} title="My deadlines — next 14 days" count={deadlines.length} link={{ to: "/deadlines", label: "All deadlines" }} loading={myDeadlines.isLoading} empty={deadlines.length === 0 && "Nothing due in the next two weeks."}>
        {deadlines.slice(0, 5).map(({ row, days }) => {
          const id = lookupId(row.id) || lookupId(row.Engagement);
          const tone = (days as number) < 0 ? "text-destructive" : (days as number) <= 3 ? "text-destructive" : (days as number) <= 7 ? "text-amber-600" : "text-foreground";
          return (
            <Link
              key={String(row.id ?? row.Case_Number)}
              to="/practices/ssdi/cases/$caseId"
              params={{ caseId: id }}
              className="flex items-center justify-between rounded border bg-card px-3 py-2 hover:bg-accent"
            >
              <div className="min-w-0">
                <div className="font-medium">{asStr(row.Case_Number) || "—"}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {asStr(row.Active_Deadline_Type)} · {asStr(row.Current_Stage)}
                </div>
              </div>
              <div className={`text-right text-sm font-medium ${tone}`}>
                {asStr(row.Deadline_Date).slice(0, 10)}
                <div className="text-xs text-muted-foreground">
                  {(days as number) < 0 ? `${Math.abs(days as number)}d overdue` : `${days}d`}
                </div>
              </div>
            </Link>
          );
        })}
      </Section>

      <Section icon={ListTodo} title="My tasks — due today or overdue" count={dueTasks.length} loading={tasks.isLoading} empty={dueTasks.length === 0 && "No tasks due. You're caught up."}>
        {dueTasks.slice(0, 5).map(({ row, days }) => (
          <TaskRow key={asStr(row.id)} row={row} days={days} />
        ))}
      </Section>

      <Section icon={Gavel} title="Upcoming hearings — next 14 days" count={upcoming.length} loading={hearings.isLoading} empty={upcoming.length === 0 && "No hearings scheduled in the next two weeks."}>
        {upcoming.slice(0, 5).map(({ row, days }) => {
          const id = lookupId(row.id) || lookupId(row.Engagement);
          return (
            <Link
              key={String(row.id ?? row.Case_Number)}
              to="/practices/ssdi/cases/$caseId"
              params={{ caseId: id }}
              className="flex items-center justify-between rounded border bg-card px-3 py-2 hover:bg-accent"
            >
              <div className="min-w-0">
                <div className="font-medium">{asStr(row.Case_Number) || "—"}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {asStr(row.Hearing_Office_ODAR)}{row.ALJ_Name ? ` · ALJ ${asStr(row.ALJ_Name)}` : ""}
                </div>
              </div>
              <div className="text-right text-sm font-medium">
                {asStr(row.ALJ_Hearing_Scheduled_Date).slice(0, 10)}
                <div className="text-xs text-muted-foreground">in {days}d</div>
              </div>
            </Link>
          );
        })}
      </Section>

      <Section icon={UserPlus} title="Leads to qualify" count={leadQueue.length} link={{ to: "/leads", label: "All leads" }} loading={leads.isLoading} empty={leadQueue.length === 0 && "No leads awaiting qualification."}>
        {leadQueue.slice(0, 5).map((row) => {
          const id = asStr(row.id);
          const name = `${asStr(row.First_Name)} ${asStr(row.Last_Name)}`.trim() || "Unnamed lead";
          return (
            <Link
              key={id}
              to="/leads/$leadId"
              params={{ leadId: id }}
              className="flex items-center justify-between rounded border bg-card px-3 py-2 hover:bg-accent"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {asStr(row.Lead_Status)}{row.Practice_Area ? ` · ${asStr(row.Practice_Area)}` : ""}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {asStr(row.Email) || asStr(row.Phone)}
              </div>
            </Link>
          );
        })}
      </Section>

      <Section icon={FileSignature} title={`Retainers awaiting signature (sent ≥ ${STALE_DAYS} days ago)`} count={pendingRet.length} link={{ to: "/engagements", label: "All engagements" }} loading={retainers.isLoading} empty={pendingRet.length === 0 && "Nothing stale."}>
        {pendingRet.slice(0, 5).map(({ row, ageDays }) => {
          const id = asStr(row.id);
          const client = `${asStr((row as Row)["Client.First_Name"])} ${asStr((row as Row)["Client.Last_Name"])}`.trim();
          return (
            <Link
              key={id}
              to="/engagements/$engagementId"
              params={{ engagementId: id }}
              className="flex items-center justify-between rounded border bg-card px-3 py-2 hover:bg-accent"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{asStr(row.Name) || "Untitled"}</div>
                <div className="text-xs text-muted-foreground truncate">{client || asStr(row.Engagement_Type)}</div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {ageDays !== null ? `sent ${ageDays}d ago` : "—"}
              </div>
            </Link>
          );
        })}
      </Section>
    </div>
  );
}

function TaskRow({ row, days }: { row: Row; days: number | null }) {
  const qc = useQueryClient();
  const complete = useServerFn(completeTask);
  const [busy, setBusy] = useState(false);
  const taskId = asStr(row.id);
  const seModule = asStr((row as Row).se_module ?? (row as Row).$se_module);
  const what = (row as Row).What_Id as { id?: string } | string | undefined;
  const caseId = seModule === "SSDI_Cases" ? (typeof what === "string" ? what : asStr(what?.id)) : "";
  const tone = days !== null && days < 0 ? "text-destructive" : "text-amber-600";

  const onComplete = async () => {
    if (!taskId || busy) return;
    setBusy(true);
    try {
      await complete({ data: { taskId, caseId: caseId || undefined } });
      toast.success("Task completed.");
      await qc.invalidateQueries({ queryKey: ["today", "myOpenTasks"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to complete task.");
    } finally {
      setBusy(false);
    }
  };

  const Body = (
    <div className="flex items-center gap-2 rounded border bg-card px-3 py-2">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onComplete(); }}
        disabled={busy}
        title="Mark complete"
        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{asStr(row.Subject) || "Untitled task"}</div>
        <div className="text-xs text-muted-foreground truncate">
          {asStr(row.Priority) || "Normal"}{row.Due_Date ? ` · due ${asStr(row.Due_Date).slice(0, 10)}` : " · no due date"}
        </div>
      </div>
      <div className={`text-xs font-medium ${tone}`}>
        {days === null ? "—" : days < 0 ? `${Math.abs(days)}d overdue` : "today"}
      </div>
    </div>
  );

  if (caseId) {
    return (
      <Link to="/practices/ssdi/cases/$caseId" params={{ caseId }} className="block hover:opacity-95">
        {Body}
      </Link>
    );
  }
  return Body;
}

function Section({
  icon: Icon, title, children, loading, empty, count, link,
}: {
  icon: typeof AlarmClock;
  title: string;
  children?: React.ReactNode;
  loading?: boolean;
  empty?: string | false;
  count?: number;
  link?: { to: string; label: string };
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{title}</span>
        {typeof count === "number" && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-foreground">{count}</span>
        )}
        {link && (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <Link to={link.to as any} className="ml-auto text-xs text-primary hover:underline">
            {link.label} →
          </Link>
        )}
      </div>
      {loading ? (
        <div className="rounded border bg-card p-4 text-sm text-muted-foreground">Loading…</div>
      ) : empty ? (
        <div className="rounded border bg-card p-4 text-sm text-muted-foreground">{empty}</div>
      ) : (
        <div className="space-y-1.5">{children}</div>
      )}
    </section>
  );
}
