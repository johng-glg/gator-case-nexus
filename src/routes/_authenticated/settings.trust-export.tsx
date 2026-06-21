import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { zohoQuery } from "@/lib/zoho.functions";
import { downloadCsv, toCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/settings/trust-export")({
  head: () => ({ meta: [{ title: "Trust accounting export — Gator" }] }),
  component: TrustExportPage,
});

type CostRow = {
  id?: string;
  Name?: string;
  Amount?: number;
  Cost_Type?: string;
  Created_Time?: string;
  Engagement?: { id?: string; name?: string } | string;
  // COQL flattened lookups
  "Engagement.Name"?: string;
  "Engagement.Client.First_Name"?: string;
  "Engagement.Client.Last_Name"?: string;
};

function TrustExportPage() {
  const runQuery = useServerFn(zohoQuery);
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);

  const q = useQuery({
    queryKey: ["allCosts"],
    queryFn: () => runQuery({ data: { name: "allCosts", params: {} } }),
  });

  const rows = (q.data?.rows ?? []) as CostRow[];

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const d = typeof r.Created_Time === "string" ? r.Created_Time.slice(0, 10) : "";
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [rows, from, to]);

  const total = filtered.reduce((s, r) => s + (typeof r.Amount === "number" ? r.Amount : 0), 0);

  function clientName(r: CostRow): string {
    const first = r["Engagement.Client.First_Name"] ?? "";
    const last = r["Engagement.Client.Last_Name"] ?? "";
    return `${first} ${last}`.trim();
  }

  function caseLabel(r: CostRow): string {
    return r["Engagement.Name"] ?? (typeof r.Engagement === "object" ? r.Engagement?.name ?? "" : "");
  }

  function handleExport() {
    const csv = toCsv(
      ["Date", "Client", "Case / Engagement", "Description", "Category", "Amount"],
      filtered.map((r) => [
        typeof r.Created_Time === "string" ? r.Created_Time.slice(0, 10) : "",
        clientName(r),
        caseLabel(r),
        String(r.Name ?? ""),
        String(r.Cost_Type ?? ""),
        typeof r.Amount === "number" ? r.Amount.toFixed(2) : "",
      ]),
    );
    downloadCsv(`trust-costs-${from}_to_${to}.csv`, csv);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display">Trust accounting export</h2>
        <p className="text-sm text-muted-foreground">
          Export all firm costs as CSV, ready to import into Zoho Books or hand to the bookkeeper.
        </p>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <Button onClick={handleExport} disabled={filtered.length === 0}>
          <Download className="h-4 w-4 mr-2" /> Download CSV ({filtered.length})
        </Button>
      </div>

      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}

      {!q.isLoading && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Client</th>
                <th className="px-3 py-2 text-left font-medium">Case</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-left font-medium">Category</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    No costs in this date range.
                  </td>
                </tr>
              )}
              {filtered.map((r, i) => (
                <tr key={r.id ?? i}>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {typeof r.Created_Time === "string" ? r.Created_Time.slice(0, 10) : "—"}
                  </td>
                  <td className="px-3 py-2">{clientName(r) || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{caseLabel(r) || "—"}</td>
                  <td className="px-3 py-2">{String(r.Name ?? "—")}</td>
                  <td className="px-3 py-2 text-muted-foreground">{String(r.Cost_Type ?? "")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {typeof r.Amount === "number"
                      ? r.Amount.toLocaleString("en-US", { style: "currency", currency: "USD" })
                      : "—"}
                  </td>
                </tr>
              ))}
              {filtered.length > 0 && (
                <tr className="font-semibold bg-muted/20">
                  <td className="px-3 py-2" colSpan={5}>
                    Total ({filtered.length} entries)
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {total.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
