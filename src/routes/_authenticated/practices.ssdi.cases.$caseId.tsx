/**
 * /practices/ssdi/cases/$caseId — SSDI case detail page.
 *
 * Layout principle: above the fold = orient + act (stage chip, deadline
 * countdown, action center); below the fold = reference + detail (case facts,
 * fees, forms & documents, costs, activity).
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  caseAdvance,
  getCase,
  zohoQuery,
  getCaseTasks,
} from "@/lib/zoho.functions";
import { Button } from "@/components/ui/button";
import { StageRail } from "@/components/cases/StageRail";
import { AdvanceStageDialog } from "@/components/cases/AdvanceStageDialog";
import { DeadlinePanel } from "@/components/cases/DeadlinePanel";
import { TasksPanel } from "@/components/cases/TasksPanel";
import { DenialNextStepBanner } from "@/components/cases/DenialNextStepBanner";
import { ClosedCaseBanner } from "@/components/cases/ClosedCaseBanner";
import { DocumentChecklist } from "@/components/cases/DocumentChecklist";
import { CostEntryForm, DeleteCostButton } from "@/components/cases/CostEntryForm";
import { ActivityPanel } from "@/components/cases/ActivityPanel";
import { DocumentRequestsPanel } from "@/components/cases/DocumentRequestsPanel";
import { MedicalRecordsPanel } from "@/components/cases/MedicalRecordsPanel";
import { MessagingPanel } from "@/components/cases/MessagingPanel";
import { CaseStatusStrip } from "@/components/cases/CaseStatusStrip";
import { CaseActionsMenu } from "@/components/cases/CaseActionsMenu";
import { NextStepCard } from "@/components/cases/NextStepCard";
import { ActionCenter } from "@/components/cases/ActionCenter";
import { FormsAndDocumentsPanel } from "@/components/cases/FormsAndDocumentsPanel";
import { CollapsibleSection } from "@/components/cases/CollapsibleSection";
import { InviteClientButton } from "@/components/cases/InviteClientButton";
import { DENIAL_NEXT_STEP, normalizeStage, type Stage } from "@/integrations/zoho/lifecycle";
import { useStageRequirements } from "@/hooks/use-stage-requirements";
import { ChevronLeft, Download } from "lucide-react";
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
  const fetchTasks = useServerFn(getCaseTasks);

  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { requirements: stageReqs } = useStageRequirements();
  const [dialogInitialStage, setDialogInitialStage] = useState<Stage | undefined>(undefined);
  const [dialogInitialFields, setDialogInitialFields] = useState<Record<string, string> | undefined>(undefined);
  const tasksSectionRef = useRef<HTMLDivElement | null>(null);
  const [docsRequestNonce, setDocsRequestNonce] = useState(0);

  // Admin check (gates the overflow menu admin tools).
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (!cancelled) setIsAdmin(Boolean(data));
    })();
    return () => { cancelled = true; };
  }, []);

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

  const engagementQ = useQuery({
    queryKey: ["engagement", engagementId],
    enabled: !!engagementId,
    queryFn: () => runQuery({ data: { name: "engagementById", params: { engagementId: engagementId! } } }),
  });
  const engagementRow = engagementQ.data?.rows?.[0] as Record<string, unknown> | undefined;
  const clientRef = engagementRow?.Client as
    | { id?: string; name?: string; First_Name?: string; Last_Name?: string }
    | string
    | undefined;
  const dottedClientId = engagementRow?.["Client.id"] as string | undefined;
  const clientId = typeof clientRef === "string" ? clientRef : (clientRef?.id ?? dottedClientId);
  const dottedFirst = engagementRow?.["Client.First_Name"] as string | undefined;
  const dottedLast = engagementRow?.["Client.Last_Name"] as string | undefined;
  const dottedName = [dottedFirst, dottedLast].filter(Boolean).join(" ").trim() || undefined;
  const clientName =
    dottedName ??
    (typeof clientRef === "object"
      ? clientRef?.name ??
        ([clientRef?.First_Name, clientRef?.Last_Name].filter(Boolean).join(" ").trim() ||
          undefined)
      : undefined);

  const retainerStatus = (engagementRow?.Retainer_Status as string) ?? undefined;
  const retainerSignedDate = (engagementRow?.Retainer_Signed_Date as string) ?? undefined;

  // Open tasks (for status strip).
  const tasksQ = useQuery({
    queryKey: ["tasks", caseId],
    enabled: validCaseId,
    queryFn: () => fetchTasks({ data: { caseId } }),
  });
  const openTaskCount = (tasksQ.data?.rows ?? []).filter(
    (t) => String(t.Status ?? "") !== "Completed",
  ).length;

  async function onAdvance(toStage: string, fields: Record<string, unknown>) {
    const result = await advance({ data: { caseId, toStage, fields } });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["case", caseId] }),
      queryClient.invalidateQueries({ queryKey: ["tasks", caseId] }),
      queryClient.invalidateQueries({ queryKey: ["ssdi-cases"] }),
      queryClient.invalidateQueries({ queryKey: ["deadlinesAtRisk"] }),
      queryClient.invalidateQueries({ queryKey: ["case-activity", caseId] }),
    ]);

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
  const isClosed = stage === "Closed";

  const deadlineISO = (record.Deadline_Date as string | null | undefined) ?? null;
  const daysToDeadline =
    typeof record.Days_To_Deadline === "number" ? (record.Days_To_Deadline as number) : null;
  const activeDeadlineType = (record.Active_Deadline_Type as string | undefined) ?? undefined;
  const hasActiveAppealClock = Boolean(deadlineISO && activeDeadlineType && activeDeadlineType !== "None");

  const ssa1696Status = (record.SSA1696_Status as string) || "Not sent";
  const ssa827Status = (record.SSA827_Status as string) || "Not sent";

  const backPay = typeof record.Back_Pay_Amount === "number" ? record.Back_Pay_Amount : null;
  const projectedFee = typeof record.Projected_Fee === "number" ? record.Projected_Fee : null;
  const userFee = typeof record.User_Fee_Withheld === "number" ? record.User_Fee_Withheld : null;

  const costsRows = costsQ.data?.rows ?? [];
  const costsEmpty = costsRows.length === 0;

  // Document request dialog trigger (passed down to ActionCenter).
  const triggerDocsRequest = () => {
    setDocsRequestNonce((n) => n + 1);
    document.getElementById("doc-requests-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="max-w-6xl mx-auto px-8 py-5 space-y-4">
      {/* Header */}
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
          <div className="flex gap-2 flex-wrap justify-end items-center">
            {!isClosed && <Button onClick={() => openAdvance()}>Advance stage</Button>}
            <CaseActionsMenu caseId={caseId} engagementId={engagementId} stage={stage} isAdmin={isAdmin} />
          </div>
        </div>
      </header>

      {/* Status strip — orient at a glance */}
      <CaseStatusStrip
        stage={stage}
        deadlineISO={deadlineISO}
        daysToDeadline={daysToDeadline}
        activeDeadlineType={activeDeadlineType}
        flags={{
          retainerSigned: retainerStatus === "Signed",
          ssa1696Status,
          ssa827Status,
          releaseExpiringSoon: record.Release_Expiring_Soon === true,
          openTaskCount,
          welcomeEmailSent: false,
        }}
        tasksAnchor="tasks-section"
      />

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

      {/* Lifecycle rail */}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Lifecycle</div>
        <StageRail current={stage} />
      </section>

      {/* Above-the-fold action row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {hasActiveAppealClock ? (
          <DeadlinePanel caseId={caseId} record={record} />
        ) : (
          <NextStepCard
            title={stage === "Retained" ? "File SSA application" : `Advance from "${stage}"`}
            description={
              stage === "Retained"
                ? "Once the application is on file with SSA, advance the case to track the initial decision clock."
                : "No appeal clock is active right now. Use the Advance Stage button when ready."
            }
            requiredFields={stage === "Retained" ? ["SSA claim number"] : undefined}
            cta={
              stage === "Retained"
                ? {
                    label: "Advance to Application filed",
                    onClick: () => openAdvance("Application filed"),
                  }
                : undefined
            }
          />
        )}
        <ActionCenter
          caseId={caseId}
          engagementId={engagementId}
          ssa1696Status={ssa1696Status}
          ssa827Status={ssa827Status}
          openTaskCount={openTaskCount}
          hasPortalLink={false}
          onInvitePortal={() => {
            toast.info("Use 'Invite to portal' in the header to send a portal invite.");
          }}
          onRequestDocuments={triggerDocsRequest}
          onScrollToTasks={() => tasksSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
      </div>

      {/* Forms & documents — unified panel */}
      <FormsAndDocumentsPanel
        caseId={caseId}
        stage={stage}
        record={record as Record<string, unknown>}
        retainerStatus={retainerStatus}
        retainerSignedDate={retainerSignedDate}
      />

      {/* Document checklist for non-form items */}
      <DocumentChecklist
        caseId={caseId}
        stage={stage}
        excludeCodes={["SSA-1696", "SSA-827", "SSA-1693", "retainer"]}
      />

      {/* Case facts — demoted to a collapsible block below the fold */}
      <CollapsibleSection title="Case facts" isEmpty={false} defaultOpen={false}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Panel title="SSA case data">
            <Row k="Sub-status" v={record.Sub_Status} />
            <Row k="Documented receipt" v={record.Documented_Receipt_Date} />
            <Row k="Date opened" v={record.Date_Opened} />
            <Row k="Claim type" v={record.Claim_Type} />
            <Row k="Onset date" v={record.Onset_Date} />
            <Row k="DLI" v={record.DLI} />
            <Row k="Primary impairment" v={record.Primary_Impairment} />
          </Panel>
          <Panel title="Lifecycle dates">
            <Row k="Notice date" v={record.Notice_Date} />
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
        </div>
      </CollapsibleSection>

      {/* Tasks */}
      <div ref={tasksSectionRef} id="tasks-section">
        <TasksPanel caseId={caseId} />
      </div>

      {/* Costs — collapsed when empty */}
      <CollapsibleSection
        title="Costs"
        isEmpty={costsEmpty}
        emptyLine="No costs recorded"
        emptyAction={engagementId && !isClosed ? <CostEntryForm engagementId={engagementId} /> : undefined}
      >
        <div className="flex items-center justify-end mb-2 gap-2 flex-wrap">
          {costsRows.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const rows = costsRows.map((c) => [
                  typeof c.Created_Time === "string" ? c.Created_Time.slice(0, 10) : "",
                  String(c.Name ?? ""),
                  String(c.Cost_Type ?? ""),
                  typeof c.Amount === "number" ? c.Amount.toFixed(2) : "",
                  String(record?.Case_Number ?? caseId),
                ]);
                const csv = toCsv(["Date", "Description", "Category", "Amount", "Case"], rows);
                downloadCsv(`costs-${record?.Case_Number ?? caseId}.csv`, csv);
              }}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
            </Button>
          )}
          {engagementId && !isClosed && <CostEntryForm engagementId={engagementId} />}
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
              {costsRows.map((c, i) => {
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
      </CollapsibleSection>

      <div id="doc-requests-section" data-nonce={docsRequestNonce}>
        <DocumentRequestsPanel caseId={caseId} engagementId={engagementId} />
      </div>

      <MedicalRecordsPanel caseId={caseId} />

      <MessagingPanel caseId={caseId} />

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
