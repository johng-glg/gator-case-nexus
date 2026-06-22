import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ChevronLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { zohoQuery } from "@/lib/zoho.functions";
import { normalizeStage, PHASES, phaseForStage, type Stage } from "@/integrations/zoho/lifecycle";
import { downloadCsv, toCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/practices/ssdi/reports/pipeline")({
  head: () => ({ meta: [{ title: "SSDI pipeline report — Gator" }] }),
  component: PipelineReportPage,
});

type GroupBy = "stage" | "phase" | "attorney" | "referral";

type CaseRow = {
  id?: string;
  Case_Number?: string;
  Current_Stage?: string;
  Sub_Status?: string;
  Date_Opened?: string;
  Deadline_Date?: string;
  Days_To_Deadline?: number;
  Assigned_Attorney?: { id?: string; name?: string } | string;
  "Assigned_Attorney.name"?: string;
  Engagement?: { id?: string; name?: string } | string;
  "Engagement.Name"?: string;
  "Engagement.Referral_Source"?: { id?: string; name?: string } | string;
  "Engagement.Referral_Source.Name"?: string;
};

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return null;
  return Math.floor((Date.now() - d) / 86400_000);
}

function bucketAge(days: number | null): string {
  if (days === null) return "Unknown";
  if (days <= 30) return "0–30 d";
  if (days <= 90) return "31–90 d";
  if (days <= 180) return "91–180 d";
  if (days <= 365) return "181–365 d";
  return "> 365 d";
}

const AGE_ORDER = ["0–30 d", "31–90 d", "91–180 d", "181–365 d", "> 365 d", "Unknown"];

function PipelineReportPage() {
  const runQuery = useServerFn(zohoQuery);
  const [groupBy, setGroupBy] = useState<GroupBy>("stage");

  const q = useQuery({
    queryKey: ["pipelineCases"],
    queryFn: () => runQuery({ data: { name: "pipelineCases", params: {} } }),
  });

  const rows = (q.data?.rows ?? []) as CaseRow[];

  function attorneyOf(r: CaseRow): string {
    const flat = r["Assigned_Attorney.name"];
    if (flat) return flat;
    const a = r.Assigned_Attorney;
    if (typeof a === "object" && a?.name) return a.name;
    return "Unassigned";
  }

  function referralOf(r: CaseRow): string {
    const flat = r["Engagement.Referral_Source.Name"];
    if (flat) return flat;
    const ref = r["Engagement.Referral_Source"];
    if (typeof ref === "object" && ref?.name) return ref.name;
    return "Direct / none";
  }

  function groupKey(r: CaseRow): string {
    const stage = normalizeStage(r.Current_Stage);
    switch (groupBy) {
      case "stage":
        return stage;
      case "phase":
        return PHASES.find((p) => p.key === phaseForStage(stage))?.label ?? "Unknown";
      case "attorney":
        return attorneyOf(r);
      case "referral":
        return referralOf(r);
    }
  }

  const summary = useMemo(() => {
    const groups = new Map<string, { count: number; ages: number[]; buckets: Record<string, number> }>();
    for (const r of rows) {
      const key = groupKey(r);
      const days = daysSince(r.Date_Opened);
      const bucket = bucketAge(days);
      const g = groups.get(key) ?? { count: 0, ages: [], buckets: {} };
      g.count += 1;
      if (days !== null) g.ages.push(days);
      g.buckets[bucket] = (g.buckets[bucket] ?? 0) + 1;
      groups.set(key, g);
    }
    const arr = Array.from(groups.entries()).map(([key, g]) => ({
      key,
      count: g.count,
      avgAge: g.ages.length ? Math.round(g.ages.reduce((a, b) => a + b, 0) / g.ages.length) : null,
      medianAge: g.ages.length ? median(g.ages) : null,
      maxAge: g.ages.length ? Math.max(...g.ages) : null,
      buckets: g.buckets,
    }));
    // Stage ordering: phase order then within-phase order; others alphabetical
    if (groupBy === "stage") {
      const order = PHASES.flatMap((p) => p.stages) as Stage[];
      arr.sort((a, b) => order.indexOf(a.key as Stage) - order.indexOf(b.key as Stage));
    } else if (groupBy === "phase") {
      const order = PHASES.map((p) => p.label);
      arr.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    } else {
      arr.sort((a, b) => b.count - a.count);
    }
    return arr;
  }, [rows, groupBy]);

  const total = rows.length;
  const overallMedian = useMemo(() => {
    const ages = rows.map((r) => daysSince(r.Date_Opened)).filter((d): d is number => d !== null);
    return ages.length ? median(ages) : null;
  }, [rows]);

  function exportCsv() {
    const csv = toCsv(
      [groupByLabel(groupBy), "Open cases", "Avg age (days)", "Median age (days)", "Oldest (days)", ...AGE_ORDER],
      summary.map((s) => [
        s.key,
        s.count,
        s.avgAge ?? "",
        s.medianAge ?? "",
        s.maxAge ?? "",
        ...AGE_ORDER.map((b) => s.buckets[b] ?? 0),
      ]),
    );
    downloadCsv(`pipeline-by-${groupBy}.csv`, csv);
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
        <h1 className="font-display text-2xl text-foreground mt-0.5">Pipeline</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open SSDI cases by {groupByLabel(groupBy).toLowerCase()}, with age-in-stage distribution.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["stage", "phase", "attorney", "referral"] as GroupBy[]).map((g) => (
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
        <div className="ml-auto flex items-center gap-3">
          <div className="text-xs text-muted-foreground">
            {total} open · median age{" "}
            {overallMedian !== null ? `${overallMedian} d` : "—"}
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
                <th className="px-4 py-2 text-right font-medium">Open</th>
                <th className="px-4 py-2 text-right font-medium">Avg</th>
                <th className="px-4 py-2 text-right font-medium">Median</th>
                <th className="px-4 py-2 text-right font-medium">Oldest</th>
                {AGE_ORDER.map((b) => (
                  <th key={b} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                    {b}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {summary.length === 0 && (
                <tr>
                  <td colSpan={5 + AGE_ORDER.length} className="px-4 py-8 text-center text-muted-foreground">
                    No open cases.
                  </td>
                </tr>
              )}
              {summary.map((s) => (
                <tr key={s.key} className="hover:bg-accent/30">
                  <td className="px-4 py-2 font-medium">{s.key}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{s.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {s.avgAge ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {s.medianAge ?? "—"}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2 text-right tabular-nums",
                      s.maxAge !== null && s.maxAge > 365 ? "text-destructive font-medium" : "text-muted-foreground",
                    )}
                  >
                    {s.maxAge ?? "—"}
                  </td>
                  {AGE_ORDER.map((b) => (
                    <td key={b} className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {s.buckets[b] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
              {summary.length > 0 && (
                <tr className="font-semibold bg-muted/20">
                  <td className="px-4 py-2">Total</td>
                  <td className="px-4 py-2 text-right tabular-nums">{total}</td>
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2 text-right tabular-nums">
                    {overallMedian ?? "—"}
                  </td>
                  <td className="px-4 py-2" />
                  {AGE_ORDER.map((b) => (
                    <td key={b} className="px-2 py-2 text-right tabular-nums">
                      {summary.reduce((a, s) => a + (s.buckets[b] ?? 0), 0) || ""}
                    </td>
                  ))}
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
  return g === "stage" ? "Stage" : g === "phase" ? "Phase" : g === "attorney" ? "Attorney" : "Referral source";
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}
