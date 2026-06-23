import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zohoQuery } from "@/lib/zoho.functions";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { normalizeStage } from "@/integrations/zoho/lifecycle";
import { SavedViewsBar } from "@/components/SavedViewsBar";
import { BulkAddTaskDialog } from "@/components/cases/BulkAddTaskDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ListChecks, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/practices/ssdi/cases/")({
  head: () => ({ meta: [{ title: "SSDI cases — Gator" }] }),
  component: CasesList,
});

type Filter = "mine" | "all" | "atRisk";
type ViewParams = { filter: Filter; stage: string };

function CasesList() {
  const [filter, setFilter] = useState<Filter>("mine");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const runQuery = useServerFn(zohoQuery);

  const queryName =
    filter === "mine" ? "myOpenCases" : filter === "atRisk" ? "deadlinesAtRisk" : "openCases";

  const cases = useQuery({
    queryKey: ["ssdi-cases", queryName],
    queryFn: () => runQuery({ data: { name: queryName } }),
  });

  const stages = useMemo(() => {
    const set = new Set<string>();
    cases.data?.rows.forEach((r) => {
      const s = r.Current_Stage;
      if (typeof s === "string") set.add(normalizeStage(s));
    });
    return Array.from(set).sort();
  }, [cases.data]);

  const filteredRows = useMemo(() => {
    const rows = cases.data?.rows ?? [];
    return stageFilter ? rows.filter((r) => normalizeStage(r.Current_Stage as string | undefined) === stageFilter) : rows;
  }, [cases.data, stageFilter]);

  // Drop selections that scroll out of the filtered view.
  useEffect(() => {
    const visible = new Set(filteredRows.map((r) => String((r as Record<string, unknown>).id ?? "")));
    setSelected((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => { if (visible.has(id)) next.add(id); });
      return next.size === prev.size ? prev : next;
    });
  }, [filteredRows]);

  const visibleIds = filteredRows.map((r) => String((r as Record<string, unknown>).id ?? "")).filter(Boolean);
  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someChecked = !allChecked && visibleIds.some((id) => selected.has(id));

  function toggleAll(check: boolean) {
    setSelected(check ? new Set(visibleIds) : new Set());
  }
  function toggleOne(id: string, check: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (check) next.add(id); else next.delete(id);
      return next;
    });
  }

  function applyView(p: ViewParams) {
    if (p?.filter) setFilter(p.filter);
    setStageFilter(typeof p?.stage === "string" ? p.stage : "");
  }

  const selectedIds = Array.from(selected);

  return (
    <div className="max-w-6xl mx-auto px-8 py-5">
      <div className="flex items-baseline justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-primary/80">SSDI workspace</div>
          <h1 className="font-display text-2xl text-foreground mt-0.5">Cases</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Social Security disability matters — appeal lifecycle from Initial through Appeals Council.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <FilterChip active={filter === "mine"} onClick={() => setFilter("mine")}>My cases</FilterChip>
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>All open</FilterChip>
          <FilterChip active={filter === "atRisk"} onClick={() => setFilter("atRisk")}>At risk</FilterChip>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="ml-2 rounded-md border border-border bg-input px-2 py-1.5 text-sm"
          >
            <option value="">All stages</option>
            {stages.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <SavedViewsBar<ViewParams>
            page="ssdi-cases"
            params={{ filter, stage: stageFilter }}
            onApply={applyView}
          />
          <Link
            to="/practices/ssdi/reports/pipeline"
            className="ml-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/40"
          >
            Pipeline report
          </Link>
          <Link
            to="/practices/ssdi/reports/outcomes"
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/40"
          >
            Win/loss report
          </Link>
          <Link
            to="/practices/ssdi/reports/referrals"
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/40"
          >
            Referral ROI
          </Link>
          <Link
            to="/practices/ssdi/intake"
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/40"
            title="Back-office: skip the Leads pipeline and create a client directly."
          >
            + Add client directly
          </Link>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
          <span className="font-medium">{selectedIds.length} selected</span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="default" onClick={() => setBulkOpen(true)}>
              <ListChecks className="h-3.5 w-3.5 mr-1.5" /> Add task to all
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 w-9">
                <Checkbox
                  checked={allChecked ? true : someChecked ? "indeterminate" : false}
                  onCheckedChange={(c) => toggleAll(c === true)}
                  aria-label="Select all visible"
                />
              </th>
              <Th>Case #</Th>
              <Th>Stage</Th>
              <Th>Sub-status</Th>
              <Th>Deadline</Th>
              <Th className="text-right">Days left</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {cases.isLoading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {cases.error && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-destructive-foreground">{(cases.error as Error).message}</td></tr>
            )}
            {cases.data && filteredRows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No cases.</td></tr>
            )}
            {filteredRows.map((r) => {
              const id = String((r as Record<string, unknown>).id ?? "");
              const days = (r as Record<string, unknown>).Days_To_Deadline;
              const atRisk = typeof days === "number" && days >= 0 && days <= 14;
              const checked = selected.has(id);
              return (
                <tr key={id} className={cn("hover:bg-accent/30", checked && "bg-primary/5")}>
                  <td className="px-3 py-3">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => toggleOne(id, c === true)}
                      aria-label={`Select case ${r.Case_Number ?? id}`}
                    />
                  </td>
                  <Td>
                    <Link to="/practices/ssdi/cases/$caseId" params={{ caseId: id }} className="font-medium text-primary hover:underline">
                      {String(r.Case_Number ?? "—")}
                    </Link>
                  </Td>
                  <Td>{r.Current_Stage ? normalizeStage(r.Current_Stage as string) : "—"}</Td>
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

      <BulkAddTaskDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        caseIds={selectedIds}
        onComplete={() => setSelected(new Set())}
      />
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "border-border bg-background/40 text-foreground hover:bg-accent/60",
      )}
    >
      {children}
    </button>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-4 py-2.5 text-left font-medium", className)}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3", className)}>{children}</td>;
}
