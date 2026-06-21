import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { ChevronLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { zohoQuery } from "@/lib/zoho.functions";
import { downloadCsv, toCsv } from "@/lib/csv";
import { ssdiNetFee, ssdiProjectedFee } from "@/integrations/zoho/fees";

export const Route = createFileRoute("/_authenticated/practices/ssdi/reports/referrals")({
  head: () => ({ meta: [{ title: "SSDI referral-source ROI — Gator" }] }),
  component: ReferralReportPage,
});

type EngRow = {
  id?: string;
  Name?: string;
  Engagement_Status?: string;
  Open_Date?: string;
  Referral_Source?: { id?: string; name?: string } | string;
  "Referral_Source.Name"?: string;
};

type ClosedRow = {
  id?: string;
  Closure_Reason?: string;
  Final_Disposition_Date?: string;
  Back_Pay_Amount?: number | string;
  Engagement?: { id?: string; name?: string } | string;
  "Engagement.Referral_Source"?: { id?: string; name?: string } | string;
  "Engagement.Referral_Source.Name"?: string;
};

const DIRECT = "Direct / none";

function refOfEng(r: EngRow): string {
  const flat = r["Referral_Source.Name"];
  if (flat) return flat;
  const v = r.Referral_Source;
  if (typeof v === "object" && v?.name) return v.name;
  return DIRECT;
}
function refOfCase(r: ClosedRow): string {
  const flat = r["Engagement.Referral_Source.Name"];
  if (flat) return flat;
  const v = r["Engagement.Referral_Source"];
  if (typeof v === "object" && v?.name) return v.name;
  return DIRECT;
}

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function ReferralReportPage() {
  const runQuery = useServerFn(zohoQuery);

  const engQ = useQuery({
    queryKey: ["ssdiEngagementsWithReferral"],
    queryFn: () => runQuery({ data: { name: "ssdiEngagementsWithReferral", params: {} } }),
  });
  const closedQ = useQuery({
    queryKey: ["closedCases"],
    queryFn: () => runQuery({ data: { name: "closedCases", params: {} } }),
  });

  const engagements = (engQ.data?.rows ?? []) as EngRow[];
  const closed = (closedQ.data?.rows ?? []) as ClosedRow[];

  const summary = useMemo(() => {
    const rows = new Map<
      string,
      { engagements: number; open: number; closed: number; won: number; lost: number; grossFees: number; netFees: number }
    >();

    for (const e of engagements) {
      const k = refOfEng(e);
      const row = rows.get(k) ?? { engagements: 0, open: 0, closed: 0, won: 0, lost: 0, grossFees: 0, netFees: 0 };
      row.engagements += 1;
      const status = (e.Engagement_Status ?? "").toLowerCase();
      if (status === "open") row.open += 1;
      else if (status) row.closed += 1;
      rows.set(k, row);
    }
    for (const c of closed) {
      const k = refOfCase(c);
      const row = rows.get(k) ?? { engagements: 0, open: 0, closed: 0, won: 0, lost: 0, grossFees: 0, netFees: 0 };
      const reason = c.Closure_Reason ?? "";
      if (reason === "Won") {
        row.won += 1;
        const bp = typeof c.Back_Pay_Amount === "number"
          ? c.Back_Pay_Amount
          : Number(c.Back_Pay_Amount ?? 0);
        if (bp > 0) {
          row.grossFees += ssdiProjectedFee(bp);
          row.netFees += ssdiNetFee(bp);
        }
      } else if (reason === "Lost") {
        row.lost += 1;
      }
      rows.set(k, row);
    }

    const arr = Array.from(rows.entries()).map(([key, r]) => {
      const decided = r.won + r.lost;
      const winRate = decided > 0 ? r.won / decided : null;
      const conversion = r.engagements > 0 ? r.won / r.engagements : null;
      const avgFee = r.won > 0 ? r.grossFees / r.won : null;
      return { key, ...r, decided, winRate, conversion, avgFee };
    });
    arr.sort((a, b) => b.grossFees - a.grossFees || b.engagements - a.engagements);
    return arr;
  }, [engagements, closed]);

  const totals = useMemo(() => {
    return summary.reduce(
      (a, s) => ({
        engagements: a.engagements + s.engagements,
        open: a.open + s.open,
        closed: a.closed + s.closed,
        won: a.won + s.won,
        lost: a.lost + s.lost,
        grossFees: a.grossFees + s.grossFees,
        netFees: a.netFees + s.netFees,
      }),
      { engagements: 0, open: 0, closed: 0, won: 0, lost: 0, grossFees: 0, netFees: 0 },
    );
  }, [summary]);

  function exportCsv() {
    const csv = toCsv(
      ["Referral source", "Engagements", "Open", "Closed", "Won", "Lost", "Conversion %", "Win rate %", "Gross fees", "Net fees", "Avg fee / win"],
      summary.map((s) => [
        s.key,
        s.engagements,
        s.open,
        s.closed,
        s.won,
        s.lost,
        s.conversion !== null ? (s.conversion * 100).toFixed(1) : "",
        s.winRate !== null ? (s.winRate * 100).toFixed(1) : "",
        Math.round(s.grossFees),
        Math.round(s.netFees),
        s.avgFee !== null ? Math.round(s.avgFee) : "",
      ]),
    );
    downloadCsv("referral-roi.csv", csv);
  }

  const loading = engQ.isLoading || closedQ.isLoading;
  const err = (engQ.error ?? closedQ.error) as Error | undefined;

  return (
    <div className="max-w-6xl mx-auto px-8 py-5 space-y-5">
      <div>
        <Link to="/practices/ssdi/cases" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to cases
        </Link>
        <div className="text-xs uppercase tracking-[0.18em] text-primary/80 mt-2">SSDI reports</div>
        <h1 className="font-display text-2xl text-foreground mt-0.5">Referral-source ROI</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          SSDI engagements and closed-case outcomes by referral source. Gross fees use the §406(a) cap
          (25% of back pay or $9,200, whichever is less); net fees subtract the SSA user fee.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-xs text-muted-foreground">
          {totals.engagements} SSDI engagements · {totals.won} won · gross{" "}
          <span className="text-foreground font-medium">{fmtMoney(totals.grossFees)}</span> · net{" "}
          <span className="text-foreground font-medium">{fmtMoney(totals.netFees)}</span>
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={summary.length === 0} className="ml-auto">
          <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
        </Button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {err && <p className="text-sm text-destructive">{err.message}</p>}

      {!loading && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Referral source</th>
                <th className="px-4 py-2 text-right font-medium">Engagements</th>
                <th className="px-4 py-2 text-right font-medium">Open</th>
                <th className="px-4 py-2 text-right font-medium">Won</th>
                <th className="px-4 py-2 text-right font-medium">Lost</th>
                <th className="px-4 py-2 text-right font-medium" title="Won ÷ total engagements">Conv.</th>
                <th className="px-4 py-2 text-right font-medium" title="Won ÷ (Won + Lost)">Win rate</th>
                <th className="px-4 py-2 text-right font-medium">Gross fees</th>
                <th className="px-4 py-2 text-right font-medium">Net fees</th>
                <th className="px-4 py-2 text-right font-medium">Avg / win</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {summary.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">No SSDI engagements.</td></tr>
              )}
              {summary.map((s) => (
                <tr key={s.key} className="hover:bg-accent/30">
                  <td className="px-4 py-2 font-medium">{s.key}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{s.engagements}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{s.open || ""}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{s.won || ""}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-destructive">{s.lost || ""}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{s.conversion !== null ? `${(s.conversion * 100).toFixed(0)}%` : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{s.winRate !== null ? `${(s.winRate * 100).toFixed(0)}%` : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{s.grossFees ? fmtMoney(s.grossFees) : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{s.netFees ? fmtMoney(s.netFees) : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{s.avgFee !== null ? fmtMoney(s.avgFee) : "—"}</td>
                </tr>
              ))}
              {summary.length > 0 && (
                <tr className="font-semibold bg-muted/20">
                  <td className="px-4 py-2">Total</td>
                  <td className="px-4 py-2 text-right tabular-nums">{totals.engagements}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{totals.open}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{totals.won}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{totals.lost}</td>
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(totals.grossFees)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(totals.netFees)}</td>
                  <td className="px-4 py-2" />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Note: cost-per-acquisition isn't tracked yet — wire marketing spend per source into the Referrals module
        to enable CPA / ROAS columns.
      </p>
    </div>
  );
}
