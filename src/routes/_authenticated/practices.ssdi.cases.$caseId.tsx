import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { caseAdvance, getCase, zohoQuery, seedTestCaseData } from "@/lib/zoho.functions";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StageRail } from "@/components/cases/StageRail";
import { AdvanceStageDialog } from "@/components/cases/AdvanceStageDialog";
import { DeadlinePanel } from "@/components/cases/DeadlinePanel";
import { TasksPanel } from "@/components/cases/TasksPanel";
import { DenialNextStepBanner } from "@/components/cases/DenialNextStepBanner";
import { ClosedCaseBanner } from "@/components/cases/ClosedCaseBanner";
import { DocumentChecklist } from "@/components/cases/DocumentChecklist";
import { CostEntryForm, DeleteCostButton } from "@/components/cases/CostEntryForm";
import { InviteClientButton } from "@/components/cases/InviteClientButton";
import { ActivityPanel } from "@/components/cases/ActivityPanel";
import { DENIAL_NEXT_STEP, normalizeStage, type Stage } from "@/integrations/zoho/lifecycle";
import { useStageRequirements } from "@/hooks/use-stage-requirements";
import { ChevronLeft, AlertTriangle, Download } from "lucide-react";
import { toast } from "sonner";
import { downloadCsv, toCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/practices/ssdi/cases/$caseId")({
  head: () => ({ meta: [{ title: "SSDI case — Gator" }] }),
  component: CaseDetail,
});

function CaseDetail() {
  const { caseId } = Route.useParams();
  const fetchCase = useServerFn(getCase);
  const runQuery = useServerFn(zohoQuery);
  const advance = useServerFn(caseAdvance);
  const seedTestCase = useServerFn(seedTestCaseData);

  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { requirements: stageReqs } = useStageRequirements();
  const [dialogInitialStage, setDialogInitialStage] = useState<Stage | undefined>(undefined);
  const [dialogInitialFields, setDialogInitialFields] = useState<Record<string, string> | undefined>(undefined);

  function openAdvance(initialStage?: Stage, initialFields?: Record<string, string>) {
    setDialogInitialStage(initialStage);
    setDialogInitialFields(initialFields);
    setDialogOpen(true);
  }

  const ID_RE = /^[A-Za-z0-9_]+$/;
  const validCaseId = ID_RE.test(caseId);

  const caseQ = useQuery({
    queryKey: ["case", caseId],
    enabled: validCaseId,
    queryFn: () => fetchCase({ data: { caseId } }),
  });

  const record = caseQ.data?.record;

  // Zoho lookup fields come back as { id, name } from getRecord, but can be a bare
  // id string from COQL. Accept either; reject anything else.
  let engagementId: string | undefined;
  const eng = record?.Engagement;
  if (typeof eng === "string" && ID_RE.test(eng)) engagementId = eng;
  else if (eng && typeof eng === "object" && "id" in (eng as object)) {
    const raw = (eng as { id: unknown }).id;
    if (typeof raw === "string" && ID_RE.test(raw)) engagementId = raw;
  }

  const costsQ = useQuery({
    queryKey: ["costs", engagementId],
    enabled: !!engagementId,
    queryFn: () => runQuery({ data: { name: "costsByEngagement", params: { engagementId: engagementId! } } }),
  });

  // Pull the engagement so we can show the linked Client (case has no direct Client field).
  const engagementQ = useQuery({
    queryKey: ["engagement", engagementId],
    enabled: !!engagementId,
    queryFn: () => runQuery({ data: { name: "engagementById", params: { engagementId: engagementId! } } }),
  });
  const engagementRow = (engagementQ.data as Array<Record<string, unknown>> | undefined)?.[0];
  const clientRef = engagementRow?.Client as
    | { id?: string; name?: string; First_Name?: string; Last_Name?: string }
    | string
    | undefined;
  const clientId = typeof clientRef === "string" ? clientRef : clientRef?.id;
  const clientName =
    typeof clientRef === "object"
      ? clientRef?.name ??
        ([clientRef?.First_Name, clientRef?.Last_Name].filter(Boolean).join(" ").trim() ||
          undefined)
      : undefined;

  async function onAdvance(toStage: string, fields: Record<string, unknown>) {
    const result = await advance({ data: { caseId, toStage, fields } });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["case", caseId] }),
      queryClient.invalidateQueries({ queryKey: ["tasks", caseId] }),
      queryClient.invalidateQueries({ queryKey: ["ssdi-cases"] }),
      queryClient.invalidateQueries({ queryKey: ["deadlinesAtRisk"] }),
      queryClient.invalidateQueries({ queryKey: ["case-activity", caseId] }),
    ]);

    // 2.3 — After a denial advance, suggest the next-tier filing stage in a toast.
    const nextStep = DENIAL_NEXT_STEP[toStage as Stage];
    if (nextStep) {
      const today = new Date().toISOString().slice(0, 10);
      toast(`Moved to "${toStage}".`, {
        description: result.deadline
          ? `Next: ${nextStep.label} by ${result.deadline}.`
          : `Next: ${nextStep.label}.`,
        action: {
          label: nextStep.label,
          onClick: () => openAdvance(nextStep.nextStage, { [nextStep.dateField]: today }),
        },
        duration: 10_000,
      });
      return;
    }

    toast.success(
      result.deadline
        ? `Moved to "${toStage}". Deadline: ${result.deadline}.`
        : `Moved to "${toStage}".`,
    );
  }


  if (caseQ.isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading case…</div>;
  if (caseQ.error) return <div className="p-8 text-sm text-destructive-foreground">{(caseQ.error as Error).message}</div>;
  if (!record) return <div className="p-8 text-sm text-muted-foreground">Case not found.</div>;

  const stage = normalizeStage(record.Current_Stage as string | undefined);
  const releaseExpiringSoon = record.Release_Expiring_Soon === true;
  const isClosed = stage === "Closed";

  const deadlineISO = (record.Deadline_Date as string | null | undefined) ?? null;
  const daysToDeadline =
    typeof record.Days_To_Deadline === "number" ? (record.Days_To_Deadline as number) : null;

  const backPay = typeof record.Back_Pay_Amount === "number" ? record.Back_Pay_Amount : null;
  const projectedFee = typeof record.Projected_Fee === "number" ? record.Projected_Fee : null;
  const userFee = typeof record.User_Fee_Withheld === "number" ? record.User_Fee_Withheld : null;

  return (
    <div className="max-w-6xl mx-auto px-8 py-5 space-y-3">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.18em] text-primary/80">SSDI case</div>
          <h1 className="font-display text-2xl text-foreground mt-0.5">
            {String(record.Case_Number ?? "Case")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Client:{" "}
            {clientId ? (
              <Link
                to="/clients/$clientId"
                params={{ clientId }}
                className="text-foreground underline-offset-2 hover:underline"
              >
                {clientName ?? clientId}
              </Link>
            ) : (
              "—"
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Link
            to="/practices/ssdi/cases"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> Back to SSDI cases
          </Link>
          <div className="flex gap-2 flex-wrap justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await seedTestCase({ data: { caseId } });
                  await queryClient.invalidateQueries({ queryKey: ["case", caseId] });
                  toast.success("Test data populated.");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              Seed test data
            </Button>
            {(stage === "Award / NOA received" || stage === "Fee petition filed") && (
              <Link
                to="/practices/ssdi/cases/$caseId/fee-petition"
                params={{ caseId }}
              >
                <Button variant="outline" size="sm">Fee petition draft</Button>
              </Link>
            )}
            <InviteClientButton caseId={caseId} engagementId={engagementId} />
            {!isClosed && <Button onClick={() => openAdvance()}>Advance stage</Button>}
          </div>
        </div>
      </header>

      {isClosed && (
        <ClosedCaseBanner
          closureReason={(record.Closure_Reason as string) ?? null}
          closureDate={(record.Final_Disposition_Date as string) ?? null}
        />
      )}

      {!isClosed && (
        <DenialNextStepBanner
          stage={stage}
          deadline={deadlineISO}
          daysRemaining={daysToDeadline}
          onAct={(nextStage, prefill) => openAdvance(nextStage, prefill)}
        />
      )}

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Lifecycle</div>
        <StageRail current={stage} />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DeadlinePanel caseId={caseId} record={record} />


        <Panel title="SSA case data">
          <Row k="Sub-status" v={record.Sub_Status} />
          <Row k="Notice date" v={record.Notice_Date} />
          <Row k="Documented receipt" v={record.Documented_Receipt_Date} />
          <Row k="Date opened" v={record.Date_Opened} />
        </Panel>

        <Panel title="Lifecycle dates">
          <Row k="Initial decision" v={record.Initial_Decision_Date} />
          <Row k="Recon decision" v={record.Recon_Decision_Date} />
          <Row k="ALJ hearing scheduled" v={record.ALJ_Hearing_Scheduled_Date} />
          <Row k="ALJ decision" v={record.ALJ_Decision_Date} />
          <Row k="Appeals Council requested" v={record.Appeals_Council_Requested_Date} />
          <Row k="Notice of Award" v={record.Notice_of_Award_Date} />
        </Panel>

        <Panel title="Fees">
          <Row k="Back pay" v={fmtMoney(backPay)} />
          <Row k="Projected fee" v={fmtMoney(projectedFee)} />
          <Row k="User fee withheld" v={fmtMoney(userFee)} />
          <p className="text-xs text-muted-foreground pt-2">
            Computed by Zoho formula fields (Projected_Fee, User_Fee_Withheld). 25% of back pay, capped at $9,200.
          </p>
        </Panel>

        <Panel title="HIPAA release">
          <Row k="Signed date" v={record.Release_Signed_Date} />
          <Row k="Expiration date" v={record.Release_Expiration_Date} />
          <div className="pt-2">
            {releaseExpiringSoon ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 border border-destructive/30 px-2 py-1 text-xs font-medium text-destructive">
                <AlertTriangle className="h-3 w-3" /> Expiring soon
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">SSA-827 releases expire one year after signing.</span>
            )}
          </div>
        </Panel>

        <TasksPanel caseId={caseId} />

        <div className="md:col-span-2">
          <DocumentChecklist caseId={caseId} stage={stage} />
        </div>
      </div>

      <section>
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Costs</div>
          <div className="flex items-center gap-2">
            {costsQ.data && costsQ.data.rows.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const rows = (costsQ.data?.rows ?? []).map((c) => [
                    typeof c.Created_Time === "string" ? c.Created_Time.slice(0, 10) : "",
                    String(c.Name ?? ""),
                    String(c.Cost_Type ?? ""),
                    typeof c.Amount === "number" ? c.Amount.toFixed(2) : "",
                    String(record?.Case_Number ?? caseId),
                  ]);
                  const csv = toCsv(
                    ["Date", "Description", "Category", "Amount", "Case"],
                    rows,
                  );
                  downloadCsv(`costs-${record?.Case_Number ?? caseId}.csv`, csv);
                }}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
              </Button>
            )}
            {engagementId && !isClosed && <CostEntryForm engagementId={engagementId} />}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Type</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
                <th className="px-4 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!engagementId && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No engagement linked.</td></tr>
              )}
              {engagementId && costsQ.isLoading && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {engagementId && costsQ.data && costsQ.data.rows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No costs recorded.</td></tr>
              )}
              {costsQ.data?.rows.map((c, i) => {
                const id = typeof c.id === "string" ? c.id : null;
                const name = String(c.Name ?? "—");
                return (
                  <tr key={id ?? i}>
                    <td className="px-4 py-2">{name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{String(c.Cost_Type ?? "")}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(typeof c.Amount === "number" ? c.Amount : null)}</td>
                    <td className="px-4 py-2 text-right">
                      {id && engagementId && !isClosed && (
                        <DeleteCostButton costId={id} engagementId={engagementId} costName={name} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <ActivityPanel caseId={caseId} engagementId={engagementId} />



      <AdvanceStageDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        currentStage={stage}
        initialStage={dialogInitialStage}
        initialFields={dialogInitialFields}
        requirementsMap={stageReqs}
        onSubmit={onAdvance}
      />
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">{title}</div>
      <div className="space-y-1.5 text-sm">{children}</div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: unknown }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="text-muted-foreground">{k}</div>
      <div className="text-right">{v === null || v === undefined || v === "" ? <span className="text-muted-foreground/60">—</span> : String(v)}</div>
    </div>
  );
}

function fmtMoney(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
