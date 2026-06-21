import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zohoQuery } from "@/lib/zoho.functions";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Leads — Gator" }] }),
  component: Leads,
});

function Leads() {
  const runQuery = useServerFn(zohoQuery);
  const [q, setQ] = useState("");

  const leads = useQuery({
    queryKey: ["allLeads"],
    queryFn: () => runQuery({ data: { name: "allLeads" } }),
  });

  const filtered = useMemo(() => {
    const rows = leads.data?.rows ?? [];
    if (!q.trim()) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) => {
      const hay = [
        r.First_Name, r.Last_Name, r.Email, r.Phone, r.Company, r.Lead_Status, r.Lead_Source,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [leads.data, q]);

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <div className="flex items-baseline justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl text-foreground">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Prospective clients in Zoho. Convert qualified leads into engagements.
          </p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, status…"
          className="w-64 rounded-md border border-border bg-input px-3 py-1.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th>Status</Th>
              <Th>Source</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {leads.isLoading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {leads.error && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-destructive-foreground">
                {(leads.error as Error).message}
              </td></tr>
            )}
            {leads.data && filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No leads match.</td></tr>
            )}
            {filtered.map((r) => {
              const id = String((r as Record<string, unknown>).id ?? "");
              const name = [r.First_Name, r.Last_Name].filter(Boolean).join(" ") || "—";
              return (
                <tr key={id} className="hover:bg-accent/30">
                  <Td className="font-medium">{name}</Td>
                  <Td className="text-muted-foreground">{String(r.Email ?? "—")}</Td>
                  <Td className="text-muted-foreground">{String(r.Phone ?? "—")}</Td>
                  <Td className="text-muted-foreground">{String(r.Lead_Status ?? "—")}</Td>
                  <Td className="text-muted-foreground">{String(r.Lead_Source ?? "—")}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 text-left font-medium">{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3", className)}>{children}</td>;
}
