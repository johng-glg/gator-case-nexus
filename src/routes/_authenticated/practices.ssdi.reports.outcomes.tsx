import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ChevronLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { zohoQuery } from "@/lib/zoho.functions";
import { downloadCsv, toCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/practices/ssdi/reports/outcomes")({
  head: () => ({ meta: [{ title: "SSDI win/loss analytics — Gator" }] }),
  component: OutcomesReportPage,
});

type GroupBy = "alj" | "office" | "impairment" | "attorney";

type ClosedRow = {
  id?: string;
  Case_Number?: string;
  Current_Stage?: string;
  Closure_Reason?: string;
  Final_Disposition_Date?: string;
  Date_Opened?: string;
  ALJ_Name?: string;
  Hearing_Office_ODAR?: string;
  Primary_Impairment?: string;
  Secondary_Impairments?: string;
  Assigned_Attorney?: { id?: string; name?: string } | string;
  "Assigned_Attorney.name"?: string;
};

const WIN = new Set(["Won"]);
const LOSS = new Set(["Lost"]);
// Withdrawn / Transferred / Client deceased / Conflict → "Other"

function attorneyOf(r: ClosedRow): string {
  const flat = r["Assigned_Attorney.name"];
  if (flat) return flat;
  const a = r.Assigned_Attorney;
  if (typeof a === "object" && a?.name) return a.name;
  return "Unassigned";
}

function days(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const da = Date.parse(a), db = Date.parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.max(0, Math.floor((db - da) / 86400_000));
}

function OutcomesReportPage() {
  const runQuery = useServerFn(zohoQuery);
  const [groupBy, setGroupBy] = useState<GroupBy>("alj");
  const [yearFilter, setYearFilter] = useState<string>("");

  const q = useQuery({
    queryKey: ["closedCases"],
    queryFn: () => runQuery({ data: { name: "closedCases", params: {} } }),
  });

  const rows = (q.data?.rows ?? []) as ClosedRow[];

  const years = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => {
      const y = r.Final_Disposition_Date?.slice(0, 4);
      if (y) s.add(y);
    });
    return Array.from(s).sort().reverse();
  }, [rows]);

  const filtered = useMemo(
    () => (yearFilter ? rows.filter((r) => r.Final_Disposition_Date?.startsWith(yearFilter)) : rows),
    [rows, yearFilter],
  );

  function keyOf(r: ClosedRow): string {
    switch (groupBy) {
      case "alj":
        return r.ALJ_Name?.trim() || "— No ALJ —";
      case "office":
        return r.Hearing_Office_ODAR?.trim() || "— No hearing office —";
      case "impairment":
        return r.Primary_Impairment?.trim() || "— Unspecified —";
      case "attorney":
        return attorneyOf(r);
    }
  }

  const summary = useMemo(() => {
    const groups = new Map<string, { won: number; lost: number; other: number; ages: number[] }>();
    for (const r of filtered) {
      const key = keyOf(r);
      const g = groups.get(key) ?? { won: 0, lost: 0, other: 0, ages: [] };
      const reason = r.Closure_Reason ?? "";
      if (WIN.has(reason)) g.won += 1;
      else if (LOSS.has(reason)) g.lost += 1;
      else g.other += 1;
      const d = days(r.Date_Opened, r.Final_Disposition_Date);
      if (d !== null) g.ages.push(d);
      groups.set(key, g);
    }
    const arr = Array.from(groups.entries()).map(([key, g]) => {
      const decided = g.won + g.lost;
      const winRate = decided > 0 ? g.won / decided : null;
      const avgDays = g.ages.length ? Math.round(g.ages.reduce((a, b) => a + b, 0) / g.ages.length) : null;
      return { key, ...g, total: g.won + g.lost + g.other, decided, winRate, avgDays };
    });
    arr.sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
    return arr;
  }, [filtered, groupBy]);

  const totals = useMemo(() => {
    const t = summary.reduce(
      (acc, s) => ({ won: acc.won + s.won, lost: acc.lost + s.lost, other: acc.other + s.other }),
      { won: 0, lost: 0, other: 0 },
    );
    const decided = t.won + t.lost;
    return { ...t, total: t.won + t.lost + t.other, decided, winRate: decided > 0 ? t.won / decided : null };
  }, [summary]);

  function exportCsv() {
    const csv = toCsv(
      [groupByLabel(groupBy), "Closed", "Won", "Lost", "Other", "Decided", "Win rate %", "Avg days to close"],
      summary.map((s) => [
        s.key,
        s.total,
        s.won,
        s.lost,
        s.other,
        s.decided,
        s.winRate !== null ? (s.winRate * 100).toFixed(1) : "",
        s.avgDays ?? "",
      ]),
    );
    downloadCsv(`outcomes-by-${groupBy}${yearFilter ? `-${yearFilter}` : ""}.csv`, csv);
  }

  return (
    <div className="max-w-6xl mx-auto px-8 py-5 space-y-5">
      <div>
        <Link
          to="/practices/ssdi/cases"
          className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back to cases
        </Link>
        <div className="text-xs uppercase tracking-[0.18em] text-primary/80 mt-2">SSDI reports</div>
        <h1 className="font-display text-2xl text-foreground mt-0.5">Win / loss analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Closed SSDI cases by {groupByLabel(groupBy).toLowerCase()}, with win rate based on Won vs Lost
          dispositions (Withdrawn / Transferred / Deceased / Conflict counted as Other).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["alj", "office", "impairment", "attorney"] as GroupBy[]).map((g) => (
          <button
            key={g}
            onClick={() => setGroupBy(g)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              groupBy === g
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border bg-background/40 text-foreground hover:bg-accent/60",
            )}
          >
            {groupByLabel(g)}
          </button>
        ))}
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="ml-2 rounded-md border border-border bg-input px-2 py-1 text-xs"
        >
          <option value="">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-xs text-muted-foreground">
            {totals.total} closed · {totals.won} won / {totals.lost} lost
            {totals.winRate !== null && (
              <> · win rate <span className="text-foreground font-medium">{(totals.winRate * 100).toFixed(1)}%</span></>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={summary.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
          </Button>
        </div>
      </div>

      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}

      {!q.isLoading && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">{groupByLabel(groupBy)}</th>
                <th className="px-4 py-2 text-right font-medium">Closed</th>
                <th className="px-4 py-2 text-right font-medium">Won</th>
                <th className="px-4 py-2 text-right font-medium">Lost</th>
                <th className="px-4 py-2 text-right font-medium">Other</th>
                <th className="px-4 py-2 text-right font-medium">Win rate</th>
                <th className="px-4 py-2 text-left font-medium w-48">Rate bar</th>
                <th className="px-4 py-2 text-right font-medium">Avg days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {summary.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    No closed cases{yearFilter ? ` in ${yearFilter}` : ""}.
                  </td>
                </tr>
              )}
              {summary.map((s) => (
                <tr key={s.key} className="hover:bg-accent/30">
                  <td className="px-4 py-2 font-medium">{s.key}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{s.total}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                    {s.won || ""}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-destructive">{s.lost || ""}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{s.other || ""}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {s.winRate !== null ? `${(s.winRate * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {s.decided > 0 ? (
                      <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                        <div
                          className="bg-emerald-500"
                          style={{ width: `${(s.won / s.decided) * 100}%` }}
                          title={`${s.won} won`}
                        />
                        <div
                          className="bg-destructive/70"
                          style={{ width: `${(s.lost / s.decided) * 100}%` }}
                          title={`${s.lost} lost`}
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">no decisions</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {s.avgDays ?? "—"}
                  </td>
                </tr>
              ))}
              {summary.length > 0 && (
                <tr className="font-semibold bg-muted/20">
                  <td className="px-4 py-2">Total</td>
                  <td className="px-4 py-2 text-right tabular-nums">{totals.total}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{totals.won}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{totals.lost}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{totals.other}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {totals.winRate !== null ? `${(totals.winRate * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2" />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function groupByLabel(g: GroupBy): string {
  return g === "alj" ? "ALJ" : g === "office" ? "Hearing office" : g === "impairment" ? "Primary impairment" : "Attorney";
}
