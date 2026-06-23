import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { convertLead, getLead, updateLeadStatus } from "@/lib/zoho.functions";
import { ChevronLeft, Loader2, ArrowRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ScreenerPanel } from "@/components/leads/ScreenerPanel";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";


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

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [conflictAlertOpen, setConflictAlertOpen] = useState(false);
  const [convertedResult, setConvertedResult] = useState<{ engagementId: string; conflictMatches: any[] } | null>(null);

  const goToEngagement = (engagementId: string) =>
    navigate({ to: "/engagements/$engagementId", params: { engagementId } });

  const convert = useMutation({
    mutationFn: (override?: { reason: string }) =>
      convertFn({ data: { leadId, override } }),
    onSuccess: (res) => {
      toast.success("Converted to engagement");
      if (res.portalInvite?.sent && res.portalInvite.email) {
        toast.success(`Portal invite sent to ${res.portalInvite.email}.`);
      } else if (res.portalInvite && !res.portalInvite.sent) {
        toast.warning(
          res.portalInvite.email
            ? `Couldn't auto-send portal invite to ${res.portalInvite.email}. You can re-send from the case page.`
            : "No email on file — portal invite skipped.",
        );
      }
      qc.invalidateQueries({ queryKey: ["allLeads"] });
      if (res.conflict?.status === "Conflict found") {
        setConvertedResult({ engagementId: res.engagementId, conflictMatches: res.conflict.matches ?? [] });
        setConflictAlertOpen(true);
      } else {
        goToEngagement(res.engagementId);
      }
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
  const tier = (rec.Lead_Tier as string | undefined) ?? "";
  const isDecline = tier === "Decline";
  const isScreened = tier === "Strong" || tier === "Marginal";
  const canConvert = isScreened && !converted;
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

      {isSSDI && <ScreenerPanel leadId={leadId} record={rec} alreadyConverted={converted} />}

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

        <div className="border-t border-border pt-4 space-y-3">
          <div className="text-sm text-muted-foreground">
            {converted ? (
              <>This lead is already <span className="text-emerald-600 font-medium">Converted</span>.</>
            ) : !isSSDI ? (
              `Conversion for ${practice || "this practice"} is coming with that practice area.`
            ) : isDecline ? (
              <span className="inline-flex items-center gap-1 text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                Screener returned <strong>Decline</strong>. Convert requires an attorney override with a reason.
              </span>
            ) : canConvert ? (
              "Ready to convert into a Client + SSDI Engagement."
            ) : (
              "Complete the screener (tier must be Strong or Marginal) to enable conversion."
            )}
          </div>

          <div className="flex items-center justify-end gap-2 flex-wrap">
            {isDecline && !converted && isSSDI && (
              <button type="button" onClick={() => setOverrideOpen((o) => !o)}
                className="rounded-md border border-rose-500/40 bg-rose-500/5 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-500/10">
                {overrideOpen ? "Cancel override" : "Override and convert…"}
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                isDecline
                  ? convert.mutate({ reason: overrideReason.trim() })
                  : convert.mutate(undefined)
              }
              disabled={
                !isSSDI || converted || convert.isPending ||
                (isDecline ? !overrideOpen || overrideReason.trim().length < 5 : !canConvert)
              }
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              {convert.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
              {convert.isPending ? "Converting…" : isDecline ? "Convert with override" : "Convert to engagement"}
            </button>
          </div>

          {overrideOpen && (
            <textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Reason for overriding the Decline tier (logged to case activity)…"
              rows={2}
              className="w-full rounded-md border border-border bg-background p-2 text-xs"
            />
          )}
        </div>
      </section>

      <AlertDialog open={conflictAlertOpen} onOpenChange={setConflictAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conflict Check Alert</AlertDialogTitle>
            <AlertDialogDescription>
              This lead’s email matches an existing Contact in your CRM.
              The new Engagement has been linked to the existing Contact instead of creating a duplicate.
              {convertedResult && convertedResult.conflictMatches.length > 0 && (
                <span className="block mt-2">
                  Matched Contact: {" "}
                  <strong>
                    {[convertedResult.conflictMatches[0].First_Name, convertedResult.conflictMatches[0].Last_Name]
                      .filter(Boolean)
                      .join(" ") || "Existing contact"}
                  </strong>
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setConflictAlertOpen(false);
                if (convertedResult) goToEngagement(convertedResult.engagementId);
              }}
            >
              Ok
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
