import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zohoQuery } from "@/lib/zoho.functions";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cases/")({
  head: () => ({ meta: [{ title: "Cases — Gator SSDI" }] }),
  component: CasesList,
});

type Filter = "mine" | "all" | "atRisk";

function CasesList() {
  const [filter, setFilter] = useState<Filter>("mine");
  const [stageFilter, setStageFilter] = useState<string>("");
  const runQuery = useServerFn(zohoQuery);

  const queryName =
    filter === "mine" ? "myOpenCases" : filter === "atRisk" ? "deadlinesAtRisk" : "openCases";

  const cases = useQuery({
    queryKey: ["cases", queryName],
    queryFn: () => runQuery({ data: { name: queryName } }),
  });

  const stages = useMemo(() => {
    const set = new Set<string>();
    cases.data?.rows.forEach((r) => {
      const s = r.Current_Stage;
      if (typeof s === "string") set.add(s);
    });
    return Array.from(set).sort();
  }, [cases.data]);

  const filteredRows = useMemo(() => {
    const rows = cases.data?.rows ?? [];
    return stageFilter ? rows.filter((r) => r.Current_Stage === stageFilter) : rows;
  }, [cases.data, stageFilter]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Cases</h1>
        <div className="flex items-center gap-2">
          <FilterChip active={filter === "mine"} onClick={() => setFilter("mine")}>My cases</FilterChip>
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>All open</FilterChip>
          <FilterChip active={filter === "atRisk"} onClick={() => setFilter("atRisk")}>At risk</FilterChip>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="ml-2 rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">All stages</option>
            {stages.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-5 rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <Th>Case #</Th>
              <Th>Stage</Th>
              <Th>Sub-status</Th>
              <Th>Deadline</Th>
              <Th className="text-right">Days left</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {cases.isLoading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {cases.error && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-destructive">{(cases.error as Error).message}</td></tr>
            )}
            {cases.data && filteredRows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No cases.</td></tr>
            )}
            {filteredRows.map((r) => {
              const id = String((r as Record<string, unknown>).id ?? "");
              const days = (r as Record<string, unknown>).Days_To_Deadline;
              const atRisk = typeof days === "number" && days >= 0 && days <= 14;
              return (
                <tr key={id} className="hover:bg-accent/30">
                  <Td>
                    <Link to="/cases/$caseId" params={{ caseId: id }} className="font-medium hover:underline">
                      {String(r.Case_Number ?? "—")}
                    </Link>
                  </Td>
                  <Td>{String(r.Current_Stage ?? "—")}</Td>
                  <Td className="text-muted-foreground">{String(r.Sub_Status ?? "")}</Td>
                  <Td>{String(r.Deadline_Date ?? "—")}</Td>
                  <Td className={cn("text-right tabular-nums", atRisk && "text-destructive font-medium")}>
                    {typeof days === "number" ? days : "—"}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active ? "bg-foreground text-background border-foreground" : "bg-background text-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-4 py-2 text-left font-medium", className)}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-2.5", className)}>{children}</td>;
}
