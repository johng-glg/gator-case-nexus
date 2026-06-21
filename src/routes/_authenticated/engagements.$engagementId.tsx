import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getContact, getEngagement, retainerSend, zohoQuery } from "@/lib/zoho.functions";
import { ChevronLeft, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";


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
    <div className="max-w-6xl mx-auto px-8 py-8 space-y-6">
      <div>
        <Link to="/engagements" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to engagements
        </Link>
      </div>

      <header>
        <div className="text-xs uppercase tracking-[0.18em] text-primary/80">Engagement</div>
        <h1 className="font-display text-3xl text-foreground mt-0.5">{String(record.Name ?? "Engagement")}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge>{String(record.Engagement_Type ?? "—")}</Badge>
          <span>· {String(record.Engagement_Status ?? "—")}</span>
          <span>· Retainer: {String(record.Retainer_Status ?? "—")}</span>
        </div>
        <p className="mt-2 text-sm">
          Client:{" "}
          {clientId ? (
            <span className="text-foreground">{fullClientName}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Total fees" value={fmtMoney(allFees)} />
        <Stat label="Total costs" value={fmtMoney(totalCosts)} />
        <Stat label="Net" value={fmtMoney(net)} emphasis={net !== null && net < 0 ? "negative" : "positive"} />
      </section>

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
                    <Td className="text-muted-foreground">{String(c.Current_Stage ?? "—")}</Td>
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
