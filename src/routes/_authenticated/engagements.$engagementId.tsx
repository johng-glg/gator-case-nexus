import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getContact, getEngagement, retainerSend, retainerReset, retainerMarkSigned, zohoQuery } from "@/lib/zoho.functions";
import { ChevronLeft, AlertTriangle, Loader2, Check, CircleDot, Circle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { normalizeStage } from "@/integrations/zoho/lifecycle";


export const Route = createFileRoute("/_authenticated/engagements/$engagementId")({
  head: () => ({ meta: [{ title: "Engagement — Gator" }] }),
  component: EngagementDetail,
});

const ID_RE = /^[A-Za-z0-9_]+$/;

function EngagementDetail() {
  const { engagementId } = Route.useParams();
  const fetchEngagement = useServerFn(getEngagement);
  const fetchContact = useServerFn(getContact);
  const runQuery = useServerFn(zohoQuery);
  const sendRetainerFn = useServerFn(retainerSend);
  const resetRetainerFn = useServerFn(retainerReset);
  const queryClient = useQueryClient();

  const sendRetainer = useMutation({
    mutationFn: () => sendRetainerFn({ data: { engagementId } }),
    onSuccess: () => {
      toast.success("Retainer sent for signature");
      queryClient.invalidateQueries({ queryKey: ["engagement", engagementId] });
    },
    onError: (err: unknown) => toast.error((err as Error).message),
  });

  const resetRetainer = useMutation({
    mutationFn: () => resetRetainerFn({ data: { engagementId } }),
    onSuccess: () => {
      toast.success("Retainer tracking reset");
      queryClient.invalidateQueries({ queryKey: ["engagement", engagementId] });
    },
    onError: (err: unknown) => toast.error((err as Error).message),
  });


  const validId = ID_RE.test(engagementId);

  const engQ = useQuery({
    queryKey: ["engagement", engagementId],
    enabled: validId,
    queryFn: () => fetchEngagement({ data: { engagementId } }),
  });

  const record = engQ.data?.record as Record<string, unknown> | null | undefined;

  // Client lookup comes back as { id, name } from getRecord.
  let clientId: string | undefined;
  let clientLookupName: string | undefined;
  const client = record?.Client as { id?: unknown; name?: unknown } | string | null | undefined;
  if (client && typeof client === "object") {
    if (typeof client.id === "string" && ID_RE.test(client.id)) clientId = client.id;
    if (typeof client.name === "string") clientLookupName = client.name;
  } else if (typeof client === "string" && ID_RE.test(client)) {
    clientId = client;
  }

  const contactQ = useQuery({
    queryKey: ["contact", clientId],
    enabled: !!clientId,
    queryFn: () => fetchContact({ data: { contactId: clientId! } }),
  });

  const casesQ = useQuery({
    queryKey: ["casesByEngagement", engagementId],
    enabled: validId,
    queryFn: () => runQuery({ data: { name: "casesByEngagement", params: { engagementId } } }),
  });

  const costsQ = useQuery({
    queryKey: ["costsByEngagement", engagementId],
    enabled: validId,
    queryFn: () => runQuery({ data: { name: "costsByEngagement", params: { engagementId } } }),
  });

  if (!validId) return <div className="p-8 text-sm text-destructive-foreground">Invalid engagement id.</div>;
  if (engQ.isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading engagement…</div>;
  if (engQ.error) return <div className="p-8 text-sm text-destructive-foreground">{(engQ.error as Error).message}</div>;
  if (!record) return <div className="p-8 text-sm text-muted-foreground">Engagement not found.</div>;

  const contact = contactQ.data?.record as Record<string, unknown> | null | undefined;
  const fullClientName =
    contact
      ? [contact.First_Name, contact.Last_Name].filter(Boolean).join(" ") || (clientLookupName ?? "—")
      : (clientLookupName ?? (contactQ.isLoading ? "Loading…" : "—"));

  const allFees = numOrNull(record.All_Fees);
  const totalCosts = numOrNull(record.Total_Costs1);
  const net = allFees !== null && totalCosts !== null ? allFees - totalCosts : null;

  return (
    <div className="max-w-6xl mx-auto px-8 py-5 space-y-3">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.18em] text-primary/80">Engagement</div>
          <h1 className="font-display text-2xl text-foreground mt-0.5">{String(record.Name ?? "Engagement")}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge>{String(record.Engagement_Type ?? "—")}</Badge>
            <span>· {String(record.Engagement_Status ?? "—")}</span>
            <span>· Retainer: {String(record.Retainer_Status ?? "—")}</span>
            <span className="text-foreground/70">·</span>
            <span>
              Client:{" "}
              {clientId ? (
                <Link
                  to="/clients/$clientId"
                  params={{ clientId }}
                  className="text-primary hover:underline"
                >
                  {fullClientName}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
          </div>
        </div>
        <Link
          to="/engagements"
          className="inline-flex shrink-0 items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back to engagements
        </Link>
      </header>


      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Total fees" value={fmtMoney(allFees)} />
        <Stat label="Total costs" value={fmtMoney(totalCosts)} />
        <Stat label="Net" value={fmtMoney(net)} emphasis={net !== null && net < 0 ? "negative" : "positive"} />
      </section>

      {record.Conflict_Check_Status === "Conflict found" && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Possible prior representation — review</div>
            <div className="text-xs opacity-80">
              The conflict check at intake found one or more existing contacts matching this client.
            </div>
          </div>
        </div>
      )}

      <RetainerPanel
        status={String(record.Retainer_Status ?? "Not sent")}
        link={record.Retainer_Link ? String(record.Retainer_Link) : undefined}
        sentDate={record.Retainer_Sent_Date ? String(record.Retainer_Sent_Date) : undefined}
        viewedDate={record.Retainer_Viewed ? String(record.Retainer_Viewed) : undefined}
        signedDate={record.Retainer_Signed_Date ? String(record.Retainer_Signed_Date) : undefined}
        onSend={() => sendRetainer.mutate()}
        sending={sendRetainer.isPending}
        onReset={() => {
          if (confirm("Reset retainer tracking on this engagement? This clears Sent / Viewed / Signed timestamps so you can re-test.")) {
            resetRetainer.mutate();
          }
        }}
        resetting={resetRetainer.isPending}
      />



      <section>
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Cases</div>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <Th>Case #</Th>
                <Th>Stage</Th>
                <Th>Sub-status</Th>
                <Th>Deadline</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {casesQ.isLoading && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {casesQ.data && casesQ.data.rows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No cases on this engagement.</td></tr>
              )}
              {casesQ.data?.rows.map((c) => {
                const cid = String((c as Record<string, unknown>).id ?? "");
                const atRisk = (c as Record<string, unknown>).Deadline_At_Risk === true;
                const days = (c as Record<string, unknown>).Days_To_Deadline;
                const deadline = (c as Record<string, unknown>).Deadline_Date;
                return (
                  <tr key={cid} className="hover:bg-accent/30">
                    <Td>
                      <Link
                        to="/practices/ssdi/cases/$caseId"
                        params={{ caseId: cid }}
                        className="font-medium text-primary hover:underline"
                      >
                        {String(c.Case_Number ?? cid)}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">{c.Current_Stage ? normalizeStage(c.Current_Stage as string) : "—"}</Td>
                    <Td className="text-muted-foreground">{String(c.Sub_Status ?? "—")}</Td>
                    <Td>
                      {deadline ? (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{String(deadline)}</span>
                          {atRisk && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 border border-destructive/30 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                              <AlertTriangle className="h-3 w-3" />
                              {typeof days === "number" ? `${days}d` : "At risk"}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Costs</div>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th>Incurred</Th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {costsQ.isLoading && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {costsQ.data && costsQ.data.rows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No costs recorded.</td></tr>
              )}
              {costsQ.data?.rows.map((c, i) => (
                <tr key={i}>
                  <Td>{String(c.Name ?? "—")}</Td>
                  <Td className="text-muted-foreground">{String(c.Cost_Type ?? "")}</Td>
                  <Td className="text-muted-foreground">{String(c.Created_Time ?? "—").slice(0, 10)}</Td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmtMoney(numOrNull(c.Amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: "positive" | "negative" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className={cn(
        "mt-1 font-display text-2xl tabular-nums",
        emphasis === "negative" && "text-destructive",
      )}>
        {value}
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary">
      {children}
    </span>
  );
}

function RetainerPanel({
  status, link, sentDate, viewedDate, signedDate, onSend, sending, onReset, resetting,
}: {
  status: string;
  link?: string;
  sentDate?: string;
  viewedDate?: string;
  signedDate?: string;
  onSend: () => void;
  sending: boolean;
  onReset?: () => void;
  resetting?: boolean;
}) {
  const STEPS = ["Not sent", "Sent", "Viewed", "Signed"] as const;
  const isError = status === "Declined" || status === "Expired";
  const currentIdx = isError ? 1 : Math.max(0, STEPS.indexOf(status as (typeof STEPS)[number]));
  const normalized = status.toLowerCase();
  const canSend = normalized !== "signed";
  const neverSent = normalized === "not sent" || normalized === "";

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Retainer</div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            {sentDate && <span>Sent {sentDate.slice(0, 10)}</span>}
            {viewedDate && <span>Viewed {viewedDate.slice(0, 10)}</span>}
            {signedDate && <span>Signed {signedDate.slice(0, 10)}</span>}
            {link && (
              <a href={link} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                View document
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onReset && !neverSent && (
            <button
              type="button"
              onClick={onReset}
              disabled={resetting}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
              title="Clear Sent / Viewed / Signed timestamps so you can re-test the retainer flow"
            >
              {resetting && <Loader2 className="h-3 w-3 animate-spin" />}
              {resetting ? "Resetting…" : "Reset tracking"}
            </button>
          )}
          {canSend && (
            <button
              type="button"
              onClick={onSend}
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {sending && <Loader2 className="h-3 w-3 animate-spin" />}
              {sending ? "Sending…" : neverSent ? "Send retainer" : "Resend retainer"}
            </button>
          )}
        </div>
      </div>
      <ol className="flex items-center w-full gap-1">
        {STEPS.map((step, i) => {
          const isDone = currentIdx > i;
          const isActive = currentIdx === i;
          const activeError = isActive && isError;
          return (
            <li key={step} className="flex items-center flex-1 last:flex-none min-w-0">
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] whitespace-nowrap min-w-0",
                  activeError && "border-destructive/40 bg-destructive/10 text-destructive font-medium",
                  isActive && !activeError && "border-primary bg-primary/10 text-primary font-medium",
                  isDone && "border-border bg-muted text-muted-foreground",
                  !isActive && !isDone && "border-dashed border-border text-muted-foreground/60",
                )}
              >
                {isDone && <Check className="h-3 w-3 shrink-0" />}
                {isActive && <CircleDot className="h-3 w-3 shrink-0" />}
                {!isActive && !isDone && <Circle className="h-3 w-3 shrink-0" />}
                <span className="truncate">{activeError ? status : step}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-px flex-1 mx-1 min-w-2",
                    currentIdx > i ? "bg-foreground/30" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}



function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 text-left font-medium">{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3", className)}>{children}</td>;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

function fmtMoney(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
