import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zohoQuery } from "@/lib/zoho.functions";
import { useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: z.object({ connected: z.string().optional() }),
  head: () => ({ meta: [{ title: "Dashboard — Gator SSDI" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { connected } = useSearch({ from: "/_authenticated/dashboard" });
  useEffect(() => {
    if (connected === "1") toast.success("Zoho connected.");
  }, [connected]);

  const runQuery = useServerFn(zohoQuery);

  const pipeline = useQuery({
    queryKey: ["pipelineByStage"],
    queryFn: () => runQuery({ data: { name: "pipelineByStage" } }),
  });

  const atRisk = useQuery({
    queryKey: ["deadlinesAtRisk"],
    queryFn: () => runQuery({ data: { name: "deadlinesAtRisk" } }),
  });

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="rounded-lg border bg-card p-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Pipeline by stage</div>
          <div className="mt-3">
            {pipeline.isLoading && <Skeleton />}
            {pipeline.error && <ErrorBox error={pipeline.error} />}
            {pipeline.data && (
              <ul className="divide-y">
                {pipeline.data.rows.length === 0 && <li className="py-2 text-sm text-muted-foreground">No open cases.</li>}
                {pipeline.data.rows.map((r, i) => (
                  <li key={i} className="flex justify-between py-1.5 text-sm">
                    <span>{String(r.Current_Stage ?? "—")}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {String((r as Record<string, unknown>)["count(id)"] ?? (r as Record<string, unknown>).count ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <Link to="/deadlines" className="block rounded-lg border bg-card p-5 hover:bg-accent/40 transition-colors">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Deadlines at risk</div>
          <div className="mt-3">
            {atRisk.isLoading && <Skeleton />}
            {atRisk.error && <ErrorBox error={atRisk.error} />}
            {atRisk.data && (
              <div className="flex items-baseline gap-2">
                <span className={`text-4xl font-semibold tabular-nums ${atRisk.data.rows.length > 0 ? "text-destructive" : ""}`}>
                  {atRisk.data.rows.length}
                </span>
                <span className="text-sm text-muted-foreground">cases · view list →</span>
              </div>
            )}
          </div>
        </Link>
      </div>
    </div>
  );
}

function Skeleton() {
  return <div className="h-16 rounded bg-muted/60 animate-pulse" />;
}

function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}
