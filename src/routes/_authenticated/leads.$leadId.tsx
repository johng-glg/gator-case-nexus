import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { convertLead, getLead, updateLeadStatus } from "@/lib/zoho.functions";
import { ChevronLeft, Loader2, ArrowRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ScreenerPanel } from "@/components/leads/ScreenerPanel";


export const Route = createFileRoute("/_authenticated/leads/$leadId")({
  head: () => ({ meta: [{ title: "Lead — Gator" }] }),
  component: LeadDetail,
});

const ID_RE = /^[A-Za-z0-9_]+$/;

const PRACTICE_CHIP: Record<string, string> = {
  SSDI: "bg-primary/15 text-primary border-primary/30",
  FCRA: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  FDCPA: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  TCPA: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  "Class Action": "bg-fuchsia-500/15 text-fuchsia-600 border-fuchsia-500/30",
};

function LeadDetail() {
  const { leadId } = Route.useParams();
  const validId = ID_RE.test(leadId);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fetchLead = useServerFn(getLead);
  const updateStatusFn = useServerFn(updateLeadStatus);
  const convertFn = useServerFn(convertLead);

  const q = useQuery({
    queryKey: ["lead", leadId],
    enabled: validId,
    queryFn: () => fetchLead({ data: { leadId } }),
  });

  const updateStatus = useMutation({
    mutationFn: (status: "New" | "Qualified" | "Disqualified") =>
      updateStatusFn({ data: { leadId, status } }),
    onSuccess: (_r, status) => {
      toast.success(`Status → ${status}`);
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      qc.invalidateQueries({ queryKey: ["allLeads"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update"),
  });

  const convert = useMutation({
    mutationFn: () => convertFn({ data: { leadId } }),
    onSuccess: (res) => {
      toast.success("Converted to engagement");
      qc.invalidateQueries({ queryKey: ["allLeads"] });
      navigate({ to: "/engagements/$engagementId", params: { engagementId: res.engagementId } });
    },
    onError: (e: any) => toast.error(e.message ?? "Conversion failed"),
  });

  if (!validId) return <div className="p-8 text-sm text-destructive-foreground">Invalid lead id.</div>;
  if (q.isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading lead…</div>;
  if (q.error) return <div className="p-8 text-sm text-destructive-foreground">{(q.error as Error).message}</div>;
  const rec = q.data?.record as Record<string, any> | null | undefined;
  if (!rec) return <div className="p-8 text-sm text-muted-foreground">Lead not found.</div>;

  const name = [rec.First_Name, rec.Last_Name].filter(Boolean).join(" ") || "—";
  const practice = String(rec.Practice_Area ?? "");
  const status = String(rec.Lead_Status ?? "");
  const owner = (rec.Owner as { name?: string } | null)?.name ?? "—";
  const converted = !!rec.Converted_Contact;
  const canConvert = status === "Qualified" && !converted;
  const isSSDI = practice === "SSDI";

  return (
    <div className="max-w-4xl mx-auto px-8 py-5 space-y-3">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.18em] text-primary/80">Lead</div>
          <h1 className="font-display text-2xl text-foreground mt-0.5">{name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            {practice && (
              <span className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                PRACTICE_CHIP[practice] ?? "border-border text-muted-foreground",
              )}>{practice}</span>
            )}
            <span className="text-muted-foreground">· {status || "—"}</span>
            <span className="text-muted-foreground">· Owner: {owner}</span>
          </div>
        </div>
        <Link
          to="/leads"
          className="inline-flex shrink-0 items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back to leads
        </Link>
      </header>


      <section className="rounded-lg border border-border bg-card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <Field label="Email" value={rec.Email} />
        <Field label="Phone" value={rec.Phone} />
        <Field label="Mobile" value={rec.Mobile} />
        <Field label="Company" value={rec.Company} />
        <Field label="Source" value={rec.Lead_Source} />
        <Field label="Created" value={String(rec.Created_Time ?? "").slice(0, 10)} />
        {rec.Description && (
          <div className="sm:col-span-2">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Description</div>
            <div className="mt-1 whitespace-pre-wrap text-foreground/90">{String(rec.Description)}</div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Status</div>
            <div className="mt-1 text-sm">Current: <span className="text-foreground">{status || "—"}</span></div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["New", "Qualified", "Disqualified"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => updateStatus.mutate(s)}
                disabled={updateStatus.isPending || status === s || converted}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs transition-colors",
                  status === s
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border bg-background hover:bg-muted/40 text-muted-foreground disabled:opacity-50",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-muted-foreground">
            {converted ? (
              <>This lead is already <span className="text-emerald-600 font-medium">Converted</span>.</>
            ) : canConvert ? (
              isSSDI ? "Ready to convert into a Client + SSDI Engagement."
                : `Conversion for ${practice || "this practice"} is coming with that practice area.`
            ) : (
              "Mark the lead Qualified to enable conversion."
            )}
          </div>
          <button
            type="button"
            onClick={() => convert.mutate()}
            disabled={!canConvert || !isSSDI || convert.isPending}
            title={!isSSDI && canConvert ? `Conversion for ${practice} is coming with that practice area.` : undefined}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {convert.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
            {convert.isPending ? "Converting…" : "Convert to engagement"}
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: unknown }) {
  const v = value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-foreground/90">{v}</div>
    </div>
  );
}
