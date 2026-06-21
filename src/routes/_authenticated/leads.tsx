import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zohoQuery } from "@/lib/zoho.functions";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Leads — Gator" }] }),
  component: Leads,
});

const PRACTICES = ["All", "SSDI", "FCRA", "FDCPA", "TCPA", "Class Action"] as const;
const STATUSES = ["Default", "All", "New", "Qualified", "Converted", "Disqualified"] as const;
type Practice = (typeof PRACTICES)[number];
type Status = (typeof STATUSES)[number];

const PRACTICE_CHIP: Record<string, string> = {
  SSDI: "bg-primary/15 text-primary border-primary/30",
  FCRA: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  FDCPA: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  TCPA: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  "Class Action": "bg-fuchsia-500/15 text-fuchsia-600 border-fuchsia-500/30",
};

const STATUS_CHIP: Record<string, string> = {
  New: "bg-muted text-muted-foreground border-border",
  Qualified: "bg-primary/15 text-primary border-primary/30",
  Converted: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  Disqualified: "bg-destructive/10 text-destructive border-destructive/30",
};

function Leads() {
  const runQuery = useServerFn(zohoQuery);
  const [q, setQ] = useState("");
  const [practice, setPractice] = useState<Practice>(() =>
    (localStorage.getItem("leads.practice") as Practice) || "All",
  );
  const [status, setStatus] = useState<Status>(() =>
    (localStorage.getItem("leads.status") as Status) || "All",
  );
  useEffect(() => { localStorage.setItem("leads.practice", practice); }, [practice]);
  useEffect(() => { localStorage.setItem("leads.status", status); }, [status]);

  const leads = useQuery({
    queryKey: ["allLeads"],
    queryFn: () => runQuery({ data: { name: "allLeads" } }),
  });

  const filtered = useMemo(() => {
    const rows = leads.data?.rows ?? [];
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      const rp = String(r.Practice_Area ?? "");
      if (practice !== "All" && rp !== practice) return false;
      const rs = String(r.Lead_Status ?? "");
      if (status === "Default") {
        if (rs !== "New" && rs !== "Qualified") return false;
      } else if (status !== "All" && rs !== status) return false;
      if (!needle) return true;
      const hay = [
        r.First_Name, r.Last_Name, r.Email, r.Phone, r.Mobile, r.Company,
        r.Lead_Status, r.Lead_Source, r.Practice_Area,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [leads.data, q, practice, status]);

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <div className="flex items-baseline justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl text-foreground">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One pipeline across all practice areas. Qualify, then convert into an engagement.
          </p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, source…"
          className="w-64 rounded-md border border-border bg-input px-3 py-1.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <FilterGroup label="Practice" value={practice} options={PRACTICES} onChange={setPractice} />
        <FilterGroup label="Status" value={status} options={STATUSES} onChange={setStatus} />
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <Th>Name</Th>
              <Th>Practice</Th>
              <Th>Status</Th>
              <Th>Source</Th>
              <Th>Owner</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {leads.isLoading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {leads.error && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-destructive-foreground">
                {(leads.error as Error).message}
              </td></tr>
            )}
            {leads.data && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No leads match.</td></tr>
            )}
            {filtered.map((r) => {
              const id = String((r as Record<string, unknown>).id ?? "");
              const name = [r.First_Name, r.Last_Name].filter(Boolean).join(" ") || "—";
              const owner = (r.Owner as { name?: string } | null)?.name ?? "—";
              const created = String(r.Created_Time ?? "").slice(0, 10);
              const p = String(r.Practice_Area ?? "");
              const s = String(r.Lead_Status ?? "");
              return (
                <tr key={id} className="hover:bg-accent/30">
                  <Td>
                    <Link
                      to="/leads/$leadId"
                      params={{ leadId: id }}
                      className="font-medium text-primary hover:underline"
                    >
                      {name}
                    </Link>
                  </Td>
                  <Td>{p ? <Chip cls={PRACTICE_CHIP[p] ?? "border-border text-muted-foreground"}>{p}</Chip> : <span className="text-muted-foreground">—</span>}</Td>
                  <Td>{s ? <Chip cls={STATUS_CHIP[s] ?? "border-border text-muted-foreground"}>{s}</Chip> : <span className="text-muted-foreground">—</span>}</Td>
                  <Td className="text-muted-foreground">{String(r.Lead_Source ?? "—")}</Td>
                  <Td className="text-muted-foreground">{owner}</Td>
                  <Td className="text-muted-foreground">{created || "—"}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterGroup<T extends string>({
  label, value, options, onChange,
}: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground mr-1">{label}</span>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
            value === o
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-border bg-background hover:bg-muted/40 text-muted-foreground",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Chip({ children, cls }: { children: React.ReactNode; cls: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", cls)}>
      {children}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 text-left font-medium">{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3", className)}>{children}</td>;
}
