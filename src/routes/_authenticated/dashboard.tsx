import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zohoQuery } from "@/lib/zoho.functions";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { PRACTICES, practiceForEngagementType } from "@/practices/registry";
import { AlarmClock, Briefcase, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: z.object({ connected: z.string().optional() }),
  head: () => ({ meta: [{ title: "Dashboard — Gator" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { connected } = useSearch({ from: "/_authenticated/dashboard" });
  useEffect(() => {
    if (connected === "1") toast.success("Zoho connected.");
  }, [connected]);

  const runQuery = useServerFn(zohoQuery);

  const pipeline = useQuery({
    queryKey: ["pipelineByPractice"],
    queryFn: () => runQuery({ data: { name: "pipelineByPractice" } }),
  });

  const atRisk = useQuery({
    queryKey: ["deadlinesAtRisk"],
    queryFn: () => runQuery({ data: { name: "deadlinesAtRisk" } }),
  });

  // Roll up { Engagement_Type, Engagement_Status, count } → per-practice counts.
  const perPractice = useMemo(() => {
    const rows = pipeline.data?.rows ?? [];
    const map = new Map<string, { open: number; closed: number; total: number }>();
    for (const r of rows) {
      const type = String((r as Record<string, unknown>).Engagement_Type ?? "");
      const status = String((r as Record<string, unknown>).Engagement_Status ?? "");
      const count = Number(
        (r as Record<string, unknown>)["count(id)"] ?? (r as Record<string, unknown>).count ?? 0,
      );
      const practice = practiceForEngagementType(type);
      const key = practice?.slug ?? "other";
      const entry = map.get(key) ?? { open: 0, closed: 0, total: 0 };
      entry.total += count;
      if (/closed|complete|won|lost/i.test(status)) entry.closed += count;
      else entry.open += count;
      map.set(key, entry);
    }
    return map;
  }, [pipeline.data]);

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-3xl text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Firm-wide view across all practice areas.
          </p>
        </div>
      </div>

      <section className="mt-8">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
          <Briefcase className="h-3.5 w-3.5" />
          Pipeline by practice area
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pipeline.isLoading && <SkeletonCards />}
          {pipeline.error && (
            <div className="col-span-full rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
              {(pipeline.error as Error).message}
            </div>
          )}
          {pipeline.data &&
            PRACTICES.map((p) => {
              const stats = perPractice.get(p.slug) ?? { open: 0, closed: 0, total: 0 };
              const linkable = p.active;
              const body = (
                <article
                  className={
                    "h-full rounded-lg border border-border bg-card p-5 transition-colors " +
                    (linkable ? "hover:border-primary/50 hover:bg-card/80" : "opacity-70")
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="font-display text-lg text-foreground">{p.label}</div>
                    {!linkable && (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Coming soon
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{p.tagline}</p>
                  <div className="mt-5 flex items-baseline gap-2">
                    <span className="font-display text-4xl text-primary tabular-nums">
                      {stats.open}
                    </span>
                    <span className="text-xs text-muted-foreground">open engagements</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {stats.closed} closed · {stats.total} total
                  </div>
                  {linkable && (
                    <div className="mt-4 inline-flex items-center gap-1 text-xs text-primary">
                      Open workspace <ArrowRight className="h-3 w-3" />
                    </div>
                  )}
                </article>
              );
              return linkable ? (
                <Link key={p.slug} to={`/practices/${p.slug}`}>
                  {body}
                </Link>
              ) : (
                <div key={p.slug}>{body}</div>
              );
            })}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
          <AlarmClock className="h-3.5 w-3.5" />
          Firm-wide deadlines at risk
        </div>
        <Link
          to="/deadlines"
          className="block rounded-lg border border-border bg-card p-5 hover:border-primary/50 transition-colors"
        >
          {atRisk.isLoading && <div className="h-12 rounded bg-muted/40 animate-pulse" />}
          {atRisk.error && (
            <div className="text-sm text-destructive-foreground">
              {(atRisk.error as Error).message}
            </div>
          )}
          {atRisk.data && (
            <div className="flex items-baseline gap-3">
              <span
                className={
                  "font-display text-5xl tabular-nums " +
                  (atRisk.data.rows.length > 0 ? "text-destructive" : "text-primary")
                }
              >
                {atRisk.data.rows.length}
              </span>
              <span className="text-sm text-muted-foreground">
                matters need attention · view list →
              </span>
            </div>
          )}
        </Link>
      </section>
    </div>
  );
}

function SkeletonCards() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-40 rounded-lg border border-border bg-card/60 animate-pulse" />
      ))}
    </>
  );
}
