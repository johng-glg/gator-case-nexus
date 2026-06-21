import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zohoQuery } from "@/lib/zoho.functions";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { PRACTICES, ALL_ENGAGEMENT_TYPES, practiceForEngagementType } from "@/practices/registry";

export const Route = createFileRoute("/_authenticated/engagements")({
  head: () => ({ meta: [{ title: "Engagements — Gator" }] }),
  component: Engagements,
});

type Scope = "all" | "mine";

function Engagements() {
  const [scope, setScope] = useState<Scope>("all");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const runQuery = useServerFn(zohoQuery);

  const queryName = scope === "mine" ? "myEngagements" : "allEngagements";

  const engagements = useQuery({
    queryKey: ["engagements", queryName],
    queryFn: () => runQuery({ data: { name: queryName } }),
  });

  const rows = engagements.data?.rows ?? [];

  const statuses = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => {
      const v = r.Engagement_Status;
      if (typeof v === "string") s.add(v);
    });
    return Array.from(s).sort();
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (typeFilter) {
      const t = String(r.Engagement_Type ?? "");
      const practice = PRACTICES.find((p) => p.slug === typeFilter);
      if (practice && !practice.engagementTypes.includes(t)) return false;
    }
    if (statusFilter && r.Engagement_Status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <div className="flex items-baseline justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl text-foreground">Engagements</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All matters across practice areas. Open one to enter the type-specific workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Chip active={scope === "all"} onClick={() => setScope("all")}>All</Chip>
          <Chip active={scope === "mine"} onClick={() => setScope("mine")}>Mine</Chip>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Chip active={!typeFilter} onClick={() => setTypeFilter("")}>All types</Chip>
        {PRACTICES.map((p) => (
          <Chip
            key={p.slug}
            active={typeFilter === p.slug}
            disabled={!p.active && !ALL_ENGAGEMENT_TYPES.length}
            onClick={() => setTypeFilter(p.slug)}
          >
            {p.label}
          </Chip>
        ))}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="ml-2 rounded-md border border-border bg-input px-2 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="mt-5 rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <Th>Engagement</Th>
              <Th>Client</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th>Retainer</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {engagements.isLoading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {engagements.error && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-destructive-foreground">
                {(engagements.error as Error).message}
              </td></tr>
            )}
            {engagements.data && filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No engagements match.</td></tr>
            )}
            {filtered.map((r) => {
              const id = String((r as Record<string, unknown>).id ?? "");
              const type = String(r.Engagement_Type ?? "");
              const practice = practiceForEngagementType(type);
              const client = clientName(r);
              return (
                <tr key={id} className="hover:bg-accent/30">
                  <Td>
                    <a
                      href={openWorkspaceHref(practice?.slug, id)}
                      className="font-medium text-primary hover:underline"
                    >
                      {String(r.Engagement_Name ?? "—")}
                    </a>
                  </Td>
                  <Td>{client ?? <span className="text-muted-foreground">—</span>}</Td>
                  <Td>
                    <TypeBadge type={type} active={!!practice?.active} />
                  </Td>
                  <Td className="text-muted-foreground">{String(r.Engagement_Status ?? "")}</Td>
                  <Td className="text-muted-foreground">{String(r.Retainer_Status ?? "")}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function clientName(r: Record<string, unknown>): string | null {
  const c = r.Client as { First_Name?: string; Last_Name?: string } | null | undefined;
  if (!c) return null;
  const name = [c.First_Name, c.Last_Name].filter(Boolean).join(" ");
  return name || null;
}

function openWorkspaceHref(slug: string | undefined, engagementId: string): string {
  if (slug === "ssdi") return `/practices/ssdi/cases?engagementId=${engagementId}`;
  if (slug) return `/practices/${slug}`;
  return "/engagements";
}

function TypeBadge({ type, active }: { type: string; active: boolean }) {
  if (!type) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {type}
    </span>
  );
}

function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "border-border bg-background/40 text-foreground hover:bg-accent/60",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 text-left font-medium">{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3", className)}>{children}</td>;
}
