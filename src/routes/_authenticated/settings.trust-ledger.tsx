/**
 * Trust Ledger — read-only firm-wide ledger derived from Zoho `Costs`.
 *
 * Groups costs by engagement, shows a chronological ledger with running
 * balance and per-engagement totals. Admin-only. Export per-engagement CSV.
 *
 * NOTE: we don't model trust deposits separately yet — this is a costs
 * ledger ("debits-only" view). When a deposits source lands, add a credit
 * row and the running-balance math already accommodates it.
 */
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { zohoQuery } from "@/lib/zoho.functions";
import { downloadCsv, toCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/settings/trust-ledger")({
  beforeLoad: ({ context }) => {
    const roles = (context as { roles?: string[] }).roles ?? [];
    if (!roles.includes("admin")) {
      throw redirect({ to: "/today" });
    }
  },
  head: () => ({ meta: [{ title: "Trust ledger — Gator" }] }),
  component: TrustLedgerPage,
});

type CostRow = {
  id?: string;
  Name?: string;
  Amount?: number;
  Cost_Type?: string;
  Created_Time?: string;
  Engagement?: { id?: string; name?: string } | string | null;
  "Engagement.Name"?: string;
  "Engagement.Client.First_Name"?: string;
  "Engagement.Client.Last_Name"?: string;
};

interface LedgerEntry {
  id: string;
  date: string;
  name: string;
  type: string;
  amount: number;
}

interface EngagementLedger {
  engagementId: string;
  engagementName: string;
  clientName: string;
  entries: LedgerEntry[];
  total: number;
}

function TrustLedgerPage() {
  const runQuery = useServerFn(zohoQuery);
  const [filter, setFilter] = useState("");

  const q = useQuery({
    queryKey: ["allCosts"],
    queryFn: () => runQuery({ data: { name: "allCosts", params: {} } }),
  });

  const rows = (q.data?.rows ?? []) as CostRow[];

  const groups = useMemo<EngagementLedger[]>(() => {
    const byEng = new Map<string, EngagementLedger>();
    for (const r of rows) {
      const engId =
        (typeof r.Engagement === "object" && r.Engagement?.id) ||
        (typeof r.Engagement === "string" ? r.Engagement : "") ||
        "_unassigned";
      const engName =
        r["Engagement.Name"] ??
        (typeof r.Engagement === "object" ? r.Engagement?.name : undefined) ??
        "(no engagement)";
      const clientName =
        `${r["Engagement.Client.First_Name"] ?? ""} ${r["Engagement.Client.Last_Name"] ?? ""}`.trim() || "—";
      const amt = typeof r.Amount === "number" ? r.Amount : 0;
      const entry: LedgerEntry = {
        id: r.id ?? `${engId}-${r.Created_Time ?? Math.random()}`,
        date: typeof r.Created_Time === "string" ? r.Created_Time.slice(0, 10) : "",
        name: String(r.Name ?? "—"),
        type: String(r.Cost_Type ?? ""),
        amount: amt,
      };
      const existing = byEng.get(engId);
      if (existing) {
        existing.entries.push(entry);
        existing.total += amt;
      } else {
        byEng.set(engId, {
          engagementId: engId,
          engagementName: engName,
          clientName,
          entries: [entry],
          total: amt,
        });
      }
    }
    for (const g of byEng.values()) {
      g.entries.sort((a, b) => a.date.localeCompare(b.date));
    }
    return Array.from(byEng.values()).sort((a, b) => b.total - a.total);
  }, [rows]);

  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return groups;
    return groups.filter(
      (g) =>
        g.engagementName.toLowerCase().includes(term) ||
        g.clientName.toLowerCase().includes(term),
    );
  }, [groups, filter]);

  const firmTotal = filtered.reduce((s, g) => s + g.total, 0);

  function exportGroup(g: EngagementLedger) {
    let running = 0;
    const csv = toCsv(
      ["Date", "Description", "Category", "Amount", "Running balance"],
      g.entries.map((e) => {
        running += e.amount;
        return [e.date, e.name, e.type, e.amount.toFixed(2), running.toFixed(2)];
      }),
    );
    const slug = g.engagementName.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase();
    downloadCsv(`trust-ledger-${slug || g.engagementId}.csv`, csv);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-display">Trust ledger</h2>
          <p className="text-sm text-muted-foreground">
            Firm-wide cost ledger grouped by engagement, with running balances. Read-only — source
            of truth is Zoho Costs.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Firm total ({filtered.length} engagements)
          </div>
          <div className="font-display text-2xl tabular-nums">
            {firmTotal.toLocaleString("en-US", { style: "currency", currency: "USD" })}
          </div>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by engagement or client…"
          className="pl-8"
        />
      </div>

      {q.isLoading && <p className="text-sm text-muted-foreground">Loading ledger…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}

      {!q.isLoading && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">No costs recorded.</p>
      )}

      <div className="space-y-3">
        {filtered.map((g) => (
          <LedgerCard key={g.engagementId} group={g} onExport={() => exportGroup(g)} />
        ))}
      </div>
    </div>
  );
}

function LedgerCard({ group, onExport }: { group: EngagementLedger; onExport: () => void }) {
  const [open, setOpen] = useState(false);
  let running = 0;
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30"
      >
        <div className="min-w-0">
          <div className="font-medium truncate">
            {group.engagementId !== "_unassigned" ? (
              <Link
                to="/engagements/$engagementId"
                params={{ engagementId: group.engagementId }}
                className="text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {group.engagementName}
              </Link>
            ) : (
              group.engagementName
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {group.clientName} · {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
            <div className="tabular-nums font-medium">
              {group.total.toLocaleString("en-US", { style: "currency", currency: "USD" })}
            </div>
          </div>
        </div>
      </button>
      {open && (
        <div className="border-t border-border">
          <div className="flex justify-end px-4 py-2">
            <Button size="sm" variant="outline" onClick={onExport}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export CSV
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-left font-medium">Category</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 text-right font-medium">Running</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {group.entries.map((e) => {
                running += e.amount;
                return (
                  <tr key={e.id}>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{e.date || "—"}</td>
                    <td className="px-3 py-2">{e.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{e.type}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {e.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {running.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
