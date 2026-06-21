import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { caseAdvance, completeTask, getCase, getCaseTasks, zohoQuery } from "@/lib/zoho.functions";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StageRail } from "@/components/cases/StageRail";
import { AdvanceStageDialog } from "@/components/cases/AdvanceStageDialog";
import { DeadlinePanel } from "@/components/cases/DeadlinePanel";
import { ChevronLeft, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/practices/ssdi/cases/$caseId")({
  head: () => ({ meta: [{ title: "SSDI case — Gator" }] }),
  component: CaseDetail,
});

function CaseDetail() {
  const { caseId } = Route.useParams();
  const fetchCase = useServerFn(getCase);
  const runQuery = useServerFn(zohoQuery);
  const advance = useServerFn(caseAdvance);
  const finishTask = useServerFn(completeTask);
  const fetchCaseTasks = useServerFn(getCaseTasks);

  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

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

  const tasksQ = useQuery({
    queryKey: ["tasks", caseId],
    enabled: validCaseId,
    queryFn: () => fetchCaseTasks({ data: { caseId } }),
  });



  async function onAdvance(toStage: string, fields: Record<string, unknown>) {
    const result = await advance({ data: { caseId, toStage, fields } });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["case", caseId] }),
      queryClient.invalidateQueries({ queryKey: ["tasks", caseId] }),
      queryClient.invalidateQueries({ queryKey: ["ssdi-cases"] }),
      queryClient.invalidateQueries({ queryKey: ["deadlinesAtRisk"] }),
    ]);
    toast.success(
      result.deadline
        ? `Moved to "${toStage}". Deadline: ${result.deadline}.`
        : `Moved to "${toStage}".`,
    );
  }

  async function onCompleteTask(taskId: string) {
    try {
      await finishTask({ data: { taskId } });
      await queryClient.invalidateQueries({ queryKey: ["tasks", caseId] });
      toast.success("Task marked complete.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function onRecomputeDeadline() {
    setRecomputing(true);
    try {
      const r = (await recomputeDeadline({ data: { caseId } })) as Record<string, unknown>;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["case", caseId] }),
        queryClient.invalidateQueries({ queryKey: ["deadlinesAtRisk"] }),
        queryClient.invalidateQueries({ queryKey: ["deadlinesAll"] }),
      ]);
      const changedKeys = Object.keys(r).filter((k) => k !== "id");
      const newDeadline = r.Deadline_Date as string | undefined;
      const newDays = r.Days_To_Deadline as number | undefined;
      if (changedKeys.length === 0) toast.message("Already up to date.");
      else if (newDeadline) toast.success(`Deadline recomputed: ${newDeadline} (${newDays ?? "—"}d).`);
      else toast.success("Deadline fields refreshed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRecomputing(false);
    }
  }

  if (caseQ.isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading case…</div>;
  if (caseQ.error) return <div className="p-8 text-sm text-destructive-foreground">{(caseQ.error as Error).message}</div>;
  if (!record) return <div className="p-8 text-sm text-muted-foreground">Case not found.</div>;

  const stage = String(record.Current_Stage ?? "");
  const days = record.Days_To_Deadline;
  const atRisk = record.Deadline_At_Risk === true;
  const releaseExpiringSoon = record.Release_Expiring_Soon === true;

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
          <Button onClick={() => setDialogOpen(true)}>Advance stage</Button>
        </div>
      </header>

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

        <Panel title="Tasks">
          {tasksQ.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {tasksQ.data && tasksQ.data.rows.length === 0 && (
            <p className="text-xs text-muted-foreground">No open tasks.</p>
          )}
          <ul className="space-y-2">
            {tasksQ.data?.rows.map((t) => {
              const id = String((t as Record<string, unknown>).id ?? "");
              return (
                <li key={id} className="flex items-start justify-between gap-2 border-b border-border/50 pb-2 last:border-0">
                  <div>
                    <div className="text-sm">{String(t.Subject ?? "—")}</div>
                    <div className="text-xs text-muted-foreground">Due {String(t.Due_Date ?? "—")}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => onCompleteTask(id)}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Done
                  </Button>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <section>
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Costs</div>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-4 py-2 text-left font-medium">Name</th><th className="px-4 py-2 text-left font-medium">Type</th><th className="px-4 py-2 text-right font-medium">Amount</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!engagementId && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">No engagement linked.</td></tr>
              )}
              {engagementId && costsQ.isLoading && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {engagementId && costsQ.data && costsQ.data.rows.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">No costs recorded.</td></tr>
              )}
              {costsQ.data?.rows.map((c, i) => (
                <tr key={i}>
                  <td className="px-4 py-2">{String(c.Name ?? "—")}</td>
                  <td className="px-4 py-2 text-muted-foreground">{String(c.Cost_Type ?? "")}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(typeof c.Amount === "number" ? c.Amount : null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <AdvanceStageDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        currentStage={stage}
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
