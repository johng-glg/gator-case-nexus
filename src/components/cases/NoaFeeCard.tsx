/**
 * NoaFeeCard — reconciles the firm's actual SSDI payment against the fee math
 * derived from the Notice of Award. Shown when an NoA date is on file (or the
 * case is at/past "Award / NOA received"). The user enters what the firm was
 * actually paid; we compute expected net (lesser of 25% / $9,200 minus user
 * fee) and surface any shortfall/overage.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, AlertTriangle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reconcileSsdiFee, ssdiProjectedFee, ssdiUserFee } from "@/integrations/zoho/fees";

interface Props {
  caseId: string;
  backPay: number | null;
  noaDate: string | null;
}

export function NoaFeeCard({ caseId, backPay, noaDate }: Props) {
  const [actualStr, setActualStr] = useState("");
  const expectedFee = backPay ? ssdiProjectedFee(backPay) : 0;
  const expectedUserFee = ssdiUserFee(expectedFee);
  const expectedNet = expectedFee - expectedUserFee;

  const actual = Number(actualStr);
  const hasActual = actualStr !== "" && Number.isFinite(actual);
  const recon =
    hasActual && backPay
      ? reconcileSsdiFee({ backPay, actualPaidToFirm: actual })
      : null;

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Notice of Award — fee reconciliation</h2>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/practices/ssdi/cases/$caseId/fee-petition" params={{ caseId }}>
            Open fee petition draft
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Stat label="NoA date" value={noaDate ?? "—"} />
        <Stat label="Back pay" value={fmt(backPay)} />
        <Stat label="Expected fee" value={fmt(expectedFee)} />
        <Stat label="Expected net" value={fmt(expectedNet)} highlight />
      </div>

      <div className="border-t border-border pt-3">
        <Label htmlFor="actualPaid" className="text-xs uppercase tracking-wider text-muted-foreground">
          Actual paid to firm (from SSA)
        </Label>
        <div className="mt-1.5 flex items-center gap-2">
          <Input
            id="actualPaid"
            type="number"
            inputMode="decimal"
            step="0.01"
            placeholder="0.00"
            value={actualStr}
            onChange={(e) => setActualStr(e.target.value)}
            className="max-w-[200px]"
          />
          {recon && (
            <ReconBadge matches={recon.matches} shortfall={recon.shortfall} />
          )}
        </div>
        {recon && !recon.matches && (
          <p className="mt-2 text-xs text-muted-foreground">
            {recon.shortfall > 0
              ? `SSA underpaid by ${fmt(recon.shortfall)}. Verify the NoA breakdown and confirm with SSA before closing.`
              : `Overpayment of ${fmt(Math.abs(recon.shortfall))} — likely a different back-pay basis. Reconcile against the NoA.`}
          </p>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-sm tabular-nums ${highlight ? "font-semibold" : ""}`}>{value}</div>
    </div>
  );
}

function ReconBadge({ matches, shortfall }: { matches: boolean; shortfall: number }) {
  if (matches) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5" /> Matches
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-800 dark:text-amber-300">
      <AlertTriangle className="h-3.5 w-3.5" />
      {shortfall > 0 ? `Short ${fmt(shortfall)}` : `Over ${fmt(Math.abs(shortfall))}`}
    </span>
  );
}

function fmt(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
