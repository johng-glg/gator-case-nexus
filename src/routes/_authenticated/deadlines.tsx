import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zohoQuery } from "@/lib/zoho.functions";
import { cn } from "@/lib/utils";
import { AlarmClock, FileWarning } from "lucide-react";

export const Route = createFileRoute("/_authenticated/deadlines")({
  head: () => ({ meta: [{ title: "Deadlines — Gator" }] }),
  component: Deadlines,
});

function Deadlines() {
  const runQuery = useServerFn(zohoQuery);
  const [atRiskOnly, setAtRiskOnly] = useState(false);

  const deadlines = useQuery({
    queryKey: ["deadlinesAll"],
    queryFn: () => runQuery({ data: { name: "deadlinesAll" } }),
  });
  const releases = useQuery({
    queryKey: ["releasesAll"],
    queryFn: () => runQuery({ data: { name: "releasesAll" } }),
  });

  const allRows = deadlines.data?.rows ?? [];
  const filteredRows = atRiskOnly
    ? allRows.filter((r) => {
        const d = (r as Record<string, unknown>).Days_To_Deadline;
        return typeof d === "number" && d <= 14;
      })
    : allRows;

  return (
    <div className="max-w-5xl mx-auto px-8 py-10 space-y-8">
      <div>
        <h1 className="font-display text-3xl text-foreground">Deadlines</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every deadline you owe, soonest first. Urgent ones are flagged.
        </p>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlarmClock className="h-4 w-4" />
            <h2 className="text-sm font-medium">Appeal deadlines</h2>
            <span className="text-xs text-muted-foreground">({filteredRows.length})</span>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={atRiskOnly}
              onChange={(e) => setAtRiskOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-destructive"
            />
            At risk only
          </label>
        </div>
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <Th>Case #</Th>
                <Th>Tier</Th>
                <Th>Deadline</Th>
                <Th className="text-right">Days left</Th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {deadlines.isLoading && (
                <Empty cols={4}>Loading…</Empty>
              )}
              {deadlines.error != null && (
                <Empty cols={4} className="text-destructive">{(deadlines.error as Error).message}</Empty>
              )}
              {deadlines.data && filteredRows.length === 0 && (
                <Empty cols={4}>
                  {atRiskOnly
                    ? "Nothing at risk. Toggle off to see all upcoming deadlines."
                    : "No open deadlines."}
                </Empty>
              )}
              {filteredRows.map((r) => {
                const id = String((r as Record<string, unknown>).id ?? "");
                const days = (r as Record<string, unknown>).Days_To_Deadline;
                const daysNum = typeof days === "number" ? days : null;
                const pastDue = daysNum !== null && daysNum < 0;
                const atRisk = daysNum !== null && daysNum <= 14;
                return (
                  <tr key={id} className="hover:bg-accent/30">
                    <Td>
                      <div className="flex items-center gap-2">
                        <Link to="/practices/ssdi/cases/$caseId" params={{ caseId: id }} className="font-medium hover:underline">
                          {String(r.Case_Number ?? "—")}
                        </Link>
                        {atRisk && (
                          <span
                            className={cn(
                              "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide",
                              pastDue
                                ? "bg-destructive text-destructive-foreground"
                                : "bg-destructive/15 text-destructive",
                            )}
                          >
                            {pastDue ? "Past due" : "At risk"}
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td>{String(r.Active_Deadline_Type ?? "—")}</Td>
                    <Td>{String(r.Deadline_Date ?? "—")}</Td>
                    <Td
                      className={cn(
                        "text-right tabular-nums",
                        pastDue && "text-destructive font-semibold",
                        !pastDue && atRisk && "text-destructive font-medium",
                      )}
                    >
                      {daysNum !== null ? `${daysNum}d` : "—"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

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
              {releases.data?.rows.map((r) => {
                const id = String((r as Record<string, unknown>).id ?? "");
                const expiring = (r as Record<string, unknown>).Release_Expiring_Soon === true;
                return (
                  <tr key={id} className="hover:bg-accent/30">
                    <Td>
                      <div className="flex items-center gap-2">
                        <Link to="/practices/ssdi/cases/$caseId" params={{ caseId: id }} className="font-medium hover:underline">
                          {String(r.Case_Number ?? "—")}
                        </Link>
                        {expiring && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-amber-500/15 text-amber-600 dark:text-amber-400">
                            Expiring soon
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td>{String(r.Release_Signed_Date ?? "—")}</Td>
                    <Td>{String(r.Release_Expiration_Date ?? "—")}</Td>
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
