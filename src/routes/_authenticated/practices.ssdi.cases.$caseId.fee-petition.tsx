import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCase, zohoQuery } from "@/lib/zoho.functions";
import { ssdiProjectedFee, ssdiUserFee, ssdiNetFee } from "@/integrations/zoho/fees";

export const Route = createFileRoute("/_authenticated/practices/ssdi/cases/$caseId/fee-petition")({
  head: () => ({ meta: [{ title: "Fee petition draft — Gator" }] }),
  component: FeePetitionPage,
});

const ID_RE = /^[A-Za-z0-9_]+$/;

function FeePetitionPage() {
  const { caseId } = Route.useParams();
  const fetchCase = useServerFn(getCase);
  const runQuery = useServerFn(zohoQuery);

  const caseQ = useQuery({
    queryKey: ["case", caseId],
    enabled: ID_RE.test(caseId),
    queryFn: () => fetchCase({ data: { caseId } }),
  });
  const record = caseQ.data?.record;

  const eng = record?.Engagement;
  const engagementId =
    typeof eng === "string" && ID_RE.test(eng)
      ? eng
      : eng && typeof eng === "object" && typeof (eng as { id?: string }).id === "string" && ID_RE.test((eng as { id: string }).id)
      ? (eng as { id: string }).id
      : undefined;

  const engagementQ = useQuery({
    queryKey: ["engagement", engagementId],
    enabled: !!engagementId,
    queryFn: () => runQuery({ data: { name: "engagementById", params: { engagementId: engagementId! } } }),
  });
  const costsQ = useQuery({
    queryKey: ["costs", engagementId],
    enabled: !!engagementId,
    queryFn: () => runQuery({ data: { name: "costsByEngagement", params: { engagementId: engagementId! } } }),
  });

  if (caseQ.isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (caseQ.error) return <div className="p-8 text-sm text-destructive">{(caseQ.error as Error).message}</div>;
  if (!record) return <div className="p-8 text-sm text-muted-foreground">Case not found.</div>;

  const engRow = (engagementQ.data as Array<Record<string, unknown>> | undefined)?.[0];
  const clientRef = engRow?.Client as
    | { name?: string; First_Name?: string; Last_Name?: string }
    | string
    | undefined;
  const clientName =
    typeof clientRef === "object"
      ? clientRef?.name ??
        [clientRef?.First_Name, clientRef?.Last_Name].filter(Boolean).join(" ").trim()
      : "—";

  const backPay = typeof record.Back_Pay_Amount === "number" ? record.Back_Pay_Amount : 0;
  const projectedFee = ssdiProjectedFee(backPay);
  const userFee = ssdiUserFee(projectedFee);
  const netFee = ssdiNetFee(backPay);

  const costs = (costsQ.data?.rows ?? []) as Array<Record<string, unknown>>;
  const costsTotal = costs.reduce(
    (s, c) => s + (typeof c.Amount === "number" ? c.Amount : 0),
    0,
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Toolbar — hidden on print */}
      <div className="print:hidden border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link
            to="/practices/ssdi/cases/$caseId"
            params={{ caseId }}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> Back to case
          </Link>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> Print / Save as PDF
          </Button>
        </div>
      </div>

      {/* Document */}
      <article className="max-w-4xl mx-auto px-10 py-12 print:px-0 print:py-0 text-foreground">
        <header className="border-b-2 border-foreground pb-4 mb-8">
          <h1 className="text-2xl font-serif font-bold">FEE PETITION — DRAFT</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Social Security Disability Insurance — 42 U.S.C. § 406(a)
          </p>
        </header>

        <section className="mb-8 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Field label="Claimant" value={clientName || "—"} />
          <Field label="Case number" value={String(record.Case_Number ?? "—")} />
          <Field label="SSA claim number" value={String(record.SSA_Claim_Number ?? "—")} />
          <Field label="Notice of Award date" value={String(record.Notice_of_Award_Date ?? "—")} />
          <Field label="Date opened" value={String(record.Date_Opened ?? "—")} />
          <Field label="Entitlement date" value={String(record.Entitlement_Date ?? "—")} />
          {record.ALJ_Name && <Field label="ALJ" value={String(record.ALJ_Name)} />}
          {record.Hearing_Office_ODAR && (
            <Field label="Hearing office" value={String(record.Hearing_Office_ODAR)} />
          )}
        </section>

        <section className="mb-8">
          <h2 className="text-sm uppercase tracking-wider font-semibold mb-3 border-b border-border pb-1">
            Fee calculation
          </h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              <Calc label="Past-due (back pay)" value={backPay} />
              <Calc label="25% of past-due" value={backPay * 0.25} />
              <Calc label="Statutory cap" value={9200} />
              <Calc label="Authorized fee (lesser of)" value={projectedFee} bold />
              <Calc label="Less: SSA user fee assessment" value={-userFee} />
              <Calc label="Net to firm (before costs)" value={netFee} bold />
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground mt-2">
            Per 20 C.F.R. § 404.1730, the authorized fee is the lesser of 25% of past-due
            benefits or the statutory cap ($9,200). The SSA user fee assessment is
            withheld from the representative's payment and is not chargeable to the client.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-sm uppercase tracking-wider font-semibold mb-3 border-b border-border pb-1">
            Case costs
          </h2>
          {costs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No costs recorded.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="text-left pb-2 font-medium">Description</th>
                  <th className="text-left pb-2 font-medium">Category</th>
                  <th className="text-right pb-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {costs.map((c, i) => (
                  <tr key={i}>
                    <td className="py-1.5">{String(c.Name ?? "—")}</td>
                    <td className="py-1.5 text-muted-foreground">{String(c.Cost_Type ?? "")}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {fmtMoney(typeof c.Amount === "number" ? c.Amount : 0)}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold border-t-2 border-foreground">
                  <td className="py-2" colSpan={2}>Total costs</td>
                  <td className="py-2 text-right tabular-nums">{fmtMoney(costsTotal)}</td>
                </tr>
              </tbody>
            </table>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Case costs are reimbursable from the claimant separately from the authorized fee.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-sm uppercase tracking-wider font-semibold mb-3 border-b border-border pb-1">
            Time &amp; services rendered
          </h2>
          <p className="text-sm text-muted-foreground italic">
            [Insert itemized services: intake, application, reconsideration, hearing prep,
            hearing attendance, post-hearing briefing. Include hours, hourly rate equivalent,
            and outcome where applicable. Pull from time-tracking system before filing.]
          </p>
        </section>

        <section className="mt-12 pt-6 border-t border-border text-sm">
          <p>I certify the foregoing is true and correct.</p>
          <div className="mt-12 grid grid-cols-2 gap-8">
            <div>
              <div className="border-b border-foreground h-6" />
              <p className="text-xs text-muted-foreground mt-1">Representative signature</p>
            </div>
            <div>
              <div className="border-b border-foreground h-6" />
              <p className="text-xs text-muted-foreground mt-1">Date</p>
            </div>
          </div>
        </section>

        <p className="print:hidden mt-12 text-xs text-muted-foreground italic">
          Draft generated {new Date().toLocaleString()} from case data. Review every figure
          and itemize services before filing with SSA.
        </p>
      </article>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function Calc({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <tr className={bold ? "font-semibold" : ""}>
      <td className="py-1.5">{label}</td>
      <td className="py-1.5 text-right tabular-nums">{fmtMoney(value)}</td>
    </tr>
  );
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
