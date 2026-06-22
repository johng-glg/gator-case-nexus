/**
 * Deadlines dashboard (Phase 1.3).
 *
 * Three concerns on one page, all anchored to the SSA appeal clock:
 *   1. Appeal deadlines — grouped by urgency bucket (Overdue, ≤7d, ≤14d, ≤30d, >30d).
 *      Filters: search by case number, mine-only, tier.
 *   2. Upcoming ALJ hearings — next 60 days, soonest first.
 *   3. HIPAA releases — expiring-soon flag from the case record.
 *
 * Click any urgency bucket card to filter the list to it. Per-row links to the case page.
 */
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zohoQuery } from "@/lib/zoho.functions";
import { cn } from "@/lib/utils";
import { AlarmClock, FileWarning, Gavel, Search, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SavedViewsBar } from "@/components/SavedViewsBar";

export const Route = createFileRoute("/_authenticated/deadlines")({
  head: () => ({ meta: [{ title: "Deadlines — Gator" }] }),
  component: Deadlines,
});

type Row = Record<string, unknown>;
type Bucket = "all" | "overdue" | "7" | "14" | "30";

const TIERS = ["Reconsideration", "ALJ Hearing", "Appeals Council", "Federal Court"] as const;

function asStr(v: unknown): string {
  return v == null || v === "" ? "" : String(v);
}
function lookupName(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v && "name" in (v as object)) {
    return String((v as { name?: unknown }).name ?? "");
  }
  return "";
}
function lookupId(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v && "id" in (v as object)) {
    return String((v as { id?: unknown }).id ?? "");
  }
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

function Deadlines() {
  const runQuery = useServerFn(zohoQuery);

  const [bucket, setBucket] = useState<Bucket>("all");
  const [mine, setMine] = useState(false);
  const [tier, setTier] = useState<string>("all");
  const [search, setSearch] = useState("");

  const deadlines = useQuery({
    queryKey: ["deadlines", mine ? "mine" : "all"],
    queryFn: () => runQuery({ data: { name: mine ? "myDeadlines" : "deadlinesAll" } }),
  });
  const hearings = useQuery({
    queryKey: ["upcomingHearings"],
    queryFn: () => runQuery({ data: { name: "upcomingHearings" } }),
  });
  const releases = useQuery({
    queryKey: ["releasesAll"],
    queryFn: () => runQuery({ data: { name: "releasesAll" } }),
  });

  const allRows = (deadlines.data?.rows ?? []) as Row[];

  // Counts for the summary cards — always against the unfiltered list.
  const counts = useMemo(() => {
    let overdue = 0, w7 = 0, w14 = 0, w30 = 0;
    for (const r of allRows) {
      const d = typeof r.Days_To_Deadline === "number" ? r.Days_To_Deadline : null;
      if (d === null) continue;
      if (d < 0) overdue++;
      else if (d <= 7) w7++;
      if (d >= 0 && d <= 14) w14++;
      if (d >= 0 && d <= 30) w30++;
    }
    return { overdue, w7, w14, w30, total: allRows.length };
  }, [allRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      const d = typeof r.Days_To_Deadline === "number" ? r.Days_To_Deadline : null;
      if (bucket === "overdue" && !(d !== null && d < 0)) return false;
      if (bucket === "7" && !(d !== null && d >= 0 && d <= 7)) return false;
      if (bucket === "14" && !(d !== null && d >= 0 && d <= 14)) return false;
      if (bucket === "30" && !(d !== null && d >= 0 && d <= 30)) return false;
      if (tier !== "all" && asStr(r.Active_Deadline_Type) !== tier) return false;
      if (q) {
        const hay = `${asStr(r.Case_Number)} ${lookupName((r as Row)["Engagement.Name"] ?? r.Engagement)} ${lookupName(r.Assigned_Attorney)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, bucket, tier, search]);

  // Group by tier for readability.
  const grouped = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of filtered) {
      const t = asStr(r.Active_Deadline_Type) || "Other";
      if (!m.has(t)) m.set(t, []);
      m.get(t)!.push(r);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const upcomingHearings = useMemo(() => {
    const rows = (hearings.data?.rows ?? []) as Row[];
    return rows
      .map((r) => ({ r, days: daysFromToday(asStr(r.ALJ_Hearing_Scheduled_Date)) }))
      .filter((x) => x.days !== null && x.days >= 0 && x.days <= 60)
      .sort((a, b) => (a.days! - b.days!));
  }, [hearings.data]);

  const viewParams = { bucket, mine, tier, search };
  function applyView(p: typeof viewParams) {
    setBucket((p.bucket as Bucket) ?? "all");
    setMine(!!p.mine);
    setTier((p.tier as string) ?? "all");
    setSearch((p.search as string) ?? "");
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-5 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-foreground">Deadlines</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every appeal clock, hearing, and release expiring across open SSDI cases — soonest first.
          </p>
        </div>
        <SavedViewsBar page="deadlines" params={viewParams} onApply={applyView} />
      </div>

      {/* Urgency summary cards — click to filter */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          label="Overdue"
          value={counts.overdue}
          tone="destructive"
          active={bucket === "overdue"}
          onClick={() => setBucket(bucket === "overdue" ? "all" : "overdue")}
        />
        <SummaryCard
          label="Due ≤ 7 days"
          value={counts.w7}
          tone="destructive-soft"
          active={bucket === "7"}
          onClick={() => setBucket(bucket === "7" ? "all" : "7")}
        />
        <SummaryCard
          label="Due ≤ 14 days"
          value={counts.w14}
          tone="amber"
          active={bucket === "14"}
          onClick={() => setBucket(bucket === "14" ? "all" : "14")}
        />
        <SummaryCard
          label="Due ≤ 30 days"
          value={counts.w30}
          tone="muted"
          active={bucket === "30"}
          onClick={() => setBucket(bucket === "30" ? "all" : "30")}
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search case #, client, attorney…"
            className="pl-8 h-9 text-sm"
          />
        </div>
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="all">All tiers</option>
          {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <Button
          variant={mine ? "default" : "outline"}
          size="sm"
          onClick={() => setMine((v) => !v)}
          className="gap-1.5"
        >
          <User className="h-3.5 w-3.5" /> {mine ? "Mine only" : "All attorneys"}
        </Button>
        {(bucket !== "all" || tier !== "all" || search) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setBucket("all"); setTier("all"); setSearch(""); }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Appeal deadlines list */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <AlarmClock className="h-4 w-4" />
          <h2 className="text-sm font-medium">Appeal deadlines</h2>
          <span className="text-xs text-muted-foreground">
            ({filtered.length}{filtered.length !== counts.total ? ` of ${counts.total}` : ""})
          </span>
        </div>

        {deadlines.isLoading && (
          <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">Loading…</div>
        )}
        {deadlines.error != null && (
          <div className="rounded-lg border bg-card p-6 text-center text-sm text-destructive">
            {(deadlines.error as Error).message}
          </div>
        )}
        {deadlines.data && filtered.length === 0 && (
          <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            No deadlines match these filters.
          </div>
        )}

        <div className="space-y-4">
          {grouped.map(([t, rows]) => (
            <TierGroup key={t} tier={t} rows={rows} />
          ))}
        </div>
      </section>

      {/* Upcoming hearings */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Gavel className="h-4 w-4" />
          <h2 className="text-sm font-medium">Upcoming ALJ hearings (next 60 days)</h2>
          <span className="text-xs text-muted-foreground">({upcomingHearings.length})</span>
        </div>
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <Th>Case #</Th>
                <Th>Client</Th>
                <Th>Date</Th>
                <Th>Office / ALJ</Th>
                <Th className="text-right">Days</Th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {hearings.isLoading && <Empty cols={5}>Loading…</Empty>}
              {!hearings.isLoading && upcomingHearings.length === 0 && (
                <Empty cols={5}>No hearings scheduled in the next 60 days.</Empty>
              )}
              {upcomingHearings.map(({ r, days }) => {
                const id = String(r.id ?? "");
                const office = asStr(r.Hearing_Office_ODAR);
                const alj = asStr(r.ALJ_Name);
                return (
                  <tr key={id} className="hover:bg-accent/30">
                    <Td>
                      <Link to="/practices/ssdi/cases/$caseId" params={{ caseId: id }} className="font-medium hover:underline">
                        {asStr(r.Case_Number) || "—"}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">{lookupName(r.Engagement) || "—"}</Td>
                    <Td>{asStr(r.ALJ_Hearing_Scheduled_Date) || "—"}</Td>
                    <Td className="text-muted-foreground">
                      {office || alj ? `${office}${office && alj ? " · " : ""}${alj}` : "—"}
                    </Td>
                    <Td className={cn("text-right tabular-nums", days! <= 14 && "text-amber-600 dark:text-amber-400 font-medium")}>
                      {days}d
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* HIPAA releases */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <FileWarning className="h-4 w-4" />
          <h2 className="text-sm font-medium">HIPAA releases</h2>
          <span className="text-xs text-muted-foreground">({releases.data?.rows.length ?? 0})</span>
        </div>
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <Th>Case #</Th>
                <Th>Signed</Th>
                <Th>Expires</Th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {releases.isLoading && <Empty cols={3}>Loading…</Empty>}
              {releases.error != null && (
                <Empty cols={3} className="text-destructive">{(releases.error as Error).message}</Empty>
              )}
              {releases.data && releases.data.rows.length === 0 && (
                <Empty cols={3}>No signed releases on open cases.</Empty>
              )}
              {(releases.data?.rows ?? []).map((r) => {
                const id = String((r as Row).id ?? "");
                const expiring = (r as Row).Release_Expiring_Soon === true;
                return (
                  <tr key={id} className="hover:bg-accent/30">
                    <Td>
                      <div className="flex items-center gap-2">
                        <Link to="/practices/ssdi/cases/$caseId" params={{ caseId: id }} className="font-medium hover:underline">
                          {asStr((r as Row).Case_Number) || "—"}
                        </Link>
                        {expiring && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-amber-500/15 text-amber-600 dark:text-amber-400">
                            Expiring soon
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td>{asStr((r as Row).Release_Signed_Date) || "—"}</Td>
                    <Td>{asStr((r as Row).Release_Expiration_Date) || "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function TierGroup({ tier, rows }: { tier: string; rows: Row[] }) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center justify-between">
        <span>{tier}</span>
        <span>{rows.length}</span>
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <Th>Case #</Th>
            <Th>Client</Th>
            <Th>Attorney</Th>
            <Th>Deadline</Th>
            <Th className="text-right">Days left</Th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => {
            const id = String(r.id ?? "");
            const days = typeof r.Days_To_Deadline === "number" ? r.Days_To_Deadline : null;
            const pastDue = days !== null && days < 0;
            const due7 = days !== null && days >= 0 && days <= 7;
            const due14 = days !== null && days >= 0 && days <= 14;
            const attorneyId = lookupId(r.Assigned_Attorney);
            const attorneyName = lookupName(r.Assigned_Attorney) || (attorneyId ? "" : "Unassigned");
            return (
              <tr key={id} className="hover:bg-accent/30">
                <Td>
                  <div className="flex items-center gap-2">
                    <Link to="/practices/ssdi/cases/$caseId" params={{ caseId: id }} className="font-medium hover:underline">
                      {asStr(r.Case_Number) || "—"}
                    </Link>
                    {pastDue && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-destructive text-destructive-foreground">
                        Past due
                      </span>
                    )}
                  </div>
                </Td>
                <Td className="text-muted-foreground">{lookupName(r.Engagement) || "—"}</Td>
                <Td className="text-muted-foreground">{attorneyName || "—"}</Td>
                <Td>{asStr(r.Deadline_Date) || "—"}</Td>
                <Td
                  className={cn(
                    "text-right tabular-nums",
                    pastDue && "text-destructive font-semibold",
                    !pastDue && due7 && "text-destructive font-medium",
                    !pastDue && !due7 && due14 && "text-amber-600 dark:text-amber-400 font-medium",
                  )}
                >
                  {days !== null ? `${days}d` : "—"}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SummaryCard(props: {
  label: string;
  value: number;
  tone: "destructive" | "destructive-soft" | "amber" | "muted";
  active: boolean;
  onClick: () => void;
}) {
  const toneClass = {
    destructive: "text-destructive",
    "destructive-soft": "text-destructive/80",
    amber: "text-amber-600 dark:text-amber-400",
    muted: "text-foreground",
  }[props.tone];
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        "text-left rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40",
        props.active && "ring-2 ring-foreground/30 border-foreground/40",
      )}
    >
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{props.label}</div>
      <div className={cn("mt-1 text-3xl font-display tabular-nums", toneClass)}>{props.value}</div>
    </button>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-4 py-2 text-left font-medium", className)}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-2.5", className)}>{children}</td>;
}
function Empty({ cols, children, className }: { cols: number; children: React.ReactNode; className?: string }) {
  return (
    <tr>
      <td colSpan={cols} className={cn("px-4 py-6 text-center text-muted-foreground", className)}>
        {children}
      </td>
    </tr>
  );
}
