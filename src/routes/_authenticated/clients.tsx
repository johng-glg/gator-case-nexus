import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zohoQuery } from "@/lib/zoho.functions";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({ meta: [{ title: "Clients — Gator" }] }),
  component: Clients,
});

function Clients() {
  const runQuery = useServerFn(zohoQuery);
  const [q, setQ] = useState("");

  const clients = useQuery({
    queryKey: ["allContacts"],
    queryFn: () => runQuery({ data: { name: "allContacts" } }),
  });

  const filtered = useMemo(() => {
    const rows = clients.data?.rows ?? [];
    if (!q.trim()) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) => {
      const hay = [
        r.First_Name, r.Last_Name, r.Email, r.Phone, r.Mailing_City, r.Mailing_State,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [clients.data, q]);

  return (
    <div className="max-w-6xl mx-auto px-8 py-5">
      <div className="flex items-baseline justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl text-foreground">Clients</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Contacts in Zoho. A client may have multiple engagements across practice areas.
          </p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, city…"
          className="w-64 rounded-md border border-border bg-input px-3 py-1.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th>Location</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {clients.isLoading && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {clients.error && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-destructive-foreground">
                {(clients.error as Error).message}
              </td></tr>
            )}
            {clients.data && filtered.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No clients match.</td></tr>
            )}
            {filtered.map((r) => {
              const id = String((r as Record<string, unknown>).id ?? "");
              const name = [r.First_Name, r.Last_Name].filter(Boolean).join(" ") || "—";
              const loc = [r.Mailing_City, r.Mailing_State].filter(Boolean).join(", ");
              return (
                <tr key={id} className="hover:bg-accent/30">
                  <Td className="font-medium">
                    <Link
                      to="/clients/$clientId"
                      params={{ clientId: id }}
                      className="text-primary hover:underline"
                    >
                      {name}
                    </Link>
                  </Td>
                  <Td className="text-muted-foreground">{String(r.Email ?? "—")}</Td>
                  <Td className="text-muted-foreground">{String(r.Phone ?? "—")}</Td>
                  <Td className="text-muted-foreground">{loc || "—"}</Td>
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
