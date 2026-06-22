/**
 * /today — personal command center.
 *
 * Three at-a-glance lists for the signed-in user:
 *   - My deadlines (next 14 days), soonest first.
 *   - Upcoming hearings (next 14 days), soonest first.
 *   - Held client messages (firm-wide review queue) — count + link to where they live.
 *
 * Data sources are existing server fns; nothing new on the read side.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zohoQuery } from "@/lib/zoho.functions";
import { AlarmClock, Gavel, Mail, Sun } from "lucide-react";

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
    queryKey: ["today", "hearings"],
    queryFn: () => runQuery({ data: { name: "upcomingHearings" } }),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deadlines = (((myDeadlines.data as any)?.rows ?? []) as Row[])
    .map((r) => ({ row: r, days: daysFromToday(asStr(r.Deadline_Date)) }))
    .filter((x) => x.days !== null && (x.days as number) <= 14)
    .sort((a, b) => (a.days! - b.days!));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upcoming = (((hearings.data as any)?.rows ?? []) as Row[])
    .map((r) => ({ row: r, days: daysFromToday(asStr(r.ALJ_Hearing_Scheduled_Date)) }))
    .filter((x) => x.days !== null && (x.days as number) >= 0 && (x.days as number) <= 14)
    .sort((a, b) => (a.days! - b.days!));

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <header className="flex items-center gap-3">
        <Sun className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Today</h1>
          <p className="text-sm text-muted-foreground">
            Your urgent deadlines and hearings for the next two weeks. Press <kbd className="rounded border bg-muted px-1 text-xs">⌘K</kbd> to jump anywhere.
          </p>
        </div>
      </header>

      <Section icon={AlarmClock} title="My deadlines — next 14 days" loading={myDeadlines.isLoading} empty={deadlines.length === 0 && "Nothing due in the next two weeks."}>
        {deadlines.map(({ row, days }) => {
          const id = lookupId(row.id) || lookupId(row.Engagement);
          const tone = (days as number) < 0 ? "text-destructive" : (days as number) <= 3 ? "text-destructive" : (days as number) <= 7 ? "text-amber-600" : "text-foreground";
          return (
            <Link
              key={String(row.id ?? row.Case_Number)}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              to={`/practices/ssdi/cases/${id}` as any}
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

      <Section icon={Gavel} title="Upcoming hearings — next 14 days" loading={hearings.isLoading} empty={upcoming.length === 0 && "No hearings scheduled in the next two weeks."}>
        {upcoming.map(({ row, days }) => {
          const id = lookupId(row.id) || lookupId(row.Engagement);
          return (
            <Link
              key={String(row.id ?? row.Case_Number)}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              to={`/practices/ssdi/cases/${id}` as any}
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

      <Section icon={Mail} title="Client messaging" empty="Held messages live on each case under the Messaging panel.">
        <p className="text-sm text-muted-foreground">
          Open a case via <kbd className="rounded border bg-muted px-1 text-xs">⌘K</kbd> to review and send held messages.
        </p>
      </Section>
    </div>
  );
}

function Section({
  icon: Icon, title, children, loading, empty,
}: {
  icon: typeof AlarmClock;
  title: string;
  children?: React.ReactNode;
  loading?: boolean;
  empty?: string | false;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Icon className="h-4 w-4" /> {title}
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
