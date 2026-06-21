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
  const atRisk = useQuery({
    queryKey: ["deadlinesAtRisk"],
    queryFn: () => runQuery({ data: { name: "deadlinesAtRisk" } }),
  });
  const releases = useQuery({
    queryKey: ["releasesExpiringSoon"],
    queryFn: () => runQuery({ data: { name: "releasesExpiringSoon" } }),
  });

  return (
    <div className="max-w-5xl mx-auto px-8 py-10 space-y-8">
      <div>
        <h1 className="font-display text-3xl text-foreground">Deadlines</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Firm-wide. Today: SSDI appeal windows and HIPAA releases — FCRA SOL and dispute
          windows slot in here when those workspaces go live.
        </p>
      </div>

      <Section
        icon={<AlarmClock className="h-4 w-4" />}
        title="Appeal deadlines at risk"
        query={atRisk}
        renderRow={(r) => {
          const id = String((r as Record<string, unknown>).id ?? "");
          const days = (r as Record<string, unknown>).Days_To_Deadline;
          return (
            <tr key={id} className="hover:bg-accent/30">
              <Td>
                <Link to="/cases/$caseId" params={{ caseId: id }} className="font-medium hover:underline">
                  {String(r.Case_Number ?? "—")}
                </Link>
              </Td>
              <Td>{String(r.Active_Deadline_Type ?? "—")}</Td>
              <Td>{String(r.Deadline_Date ?? "—")}</Td>
              <Td className="text-right tabular-nums text-destructive font-medium">
                {typeof days === "number" ? `${days}d` : "—"}
              </Td>
            </tr>
          );
        }}
        columns={["Case #", "Tier", "Deadline", "Left"]}
      />

      <Section
        icon={<FileWarning className="h-4 w-4" />}
        title="Releases expiring soon"
        query={releases}
        renderRow={(r) => {
          const id = String((r as Record<string, unknown>).id ?? "");
          return (
            <tr key={id} className="hover:bg-accent/30">
              <Td>
                <Link to="/cases/$caseId" params={{ caseId: id }} className="font-medium hover:underline">
                  {String(r.Case_Number ?? "—")}
                </Link>
              </Td>
              <Td>{String(r.Release_Expiration_Date ?? "—")}</Td>
            </tr>
          );
        }}
        columns={["Case #", "Expires"]}
      />
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Section({ icon, title, query, columns, renderRow }: {
  icon: React.ReactNode;
  title: string;
  query: { isLoading: boolean; error: unknown; data?: { rows: Array<Record<string, unknown>> } };
  columns: string[];
  renderRow: (r: Record<string, unknown>) => React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="text-sm font-medium">{title}</h2>
      </div>
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {columns.map((c, i) => (
                <th key={c} className={cn("px-4 py-2 text-left font-medium", i === columns.length - 1 && "text-right")}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {query.isLoading && (
              <tr><td colSpan={columns.length} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {query.error != null && (
              <tr><td colSpan={columns.length} className="px-4 py-6 text-center text-destructive">{(query.error as Error).message}</td></tr>
            )}
            {query.data && query.data.rows.length === 0 && (
              <tr><td colSpan={columns.length} className="px-4 py-6 text-center text-muted-foreground">Nothing here. Computed by the deadline engine — populates as cases advance or the daily sweep runs.</td></tr>
            )}
            {query.data?.rows.map((r) => renderRow(r))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-2.5", className)}>{children}</td>;
}
