/**
 * SsaFormsPanel — shows SSA-1696 / SSA-827 (+ optional SSA-1693) e-sign status on the case page.
 *
 *   - SSA-1696 auto-sends when the case opens; Resend available.
 *   - SSA-827 is manual-only and gated behind an attestation dialog (POMS DI 11005.017 §C.6
 *     requires SSA attestation before a CPAS-signed 827 is accepted).
 *   - SSA-1693 (fee agreement) is wired but manual-only; only shown if status field exists on the
 *     case record.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { sendIntakeForm } from "@/lib/zoho.functions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, ShieldAlert } from "lucide-react";

type FormCode = "SSA-1696" | "SSA-827" | "SSA-1693";

interface Row {
  code: FormCode;
  label: string;
  status: string;
  link?: string;
  sentDate?: string;
  signedDate?: string;
  requiresAttestation?: boolean;
  releaseExpiringSoon?: boolean;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "Signed":   return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "Sent":     return "bg-blue-100 text-blue-800 border-blue-200";
    case "Declined": return "bg-rose-100 text-rose-800 border-rose-200";
    case "Expired":  return "bg-amber-100 text-amber-800 border-amber-200";
    default:         return "bg-muted text-muted-foreground border-border";
  }
}

export function SsaFormsPanel({ caseId, record }: { caseId: string; record: Record<string, unknown> | undefined }) {
  const send = useServerFn(sendIntakeForm);
  const qc = useQueryClient();
  const [attestOpen, setAttestOpen] = useState(false);
  const [attested, setAttested] = useState(false);

  const get = (k: string) => (record?.[k] as string | boolean | undefined);

  const rows: Row[] = [
    {
      code: "SSA-1696",
      label: "SSA-1696 — Appointment of Representative",
      status: (get("SSA1696_Status") as string) || "Not sent",
      link: get("SSA1696_Link") as string | undefined,
      sentDate: get("SSA1696_Sent_Date") as string | undefined,
      signedDate: get("SSA1696_Signed_Date") as string | undefined,
    },
    {
      code: "SSA-827",
      label: "SSA-827 — Authorization to Disclose Information",
      status: (get("SSA827_Status") as string) || "Not sent",
      link: get("SSA827_Link") as string | undefined,
      sentDate: get("SSA827_Sent_Date") as string | undefined,
      signedDate: get("Release_Signed_Date") as string | undefined,
      requiresAttestation: true,
      releaseExpiringSoon: Boolean(get("Release_Expiring_Soon")),
    },
  ];
  // Only show SSA-1693 row if the field exists on this case record (i.e. configured).
  if (record && "SSA1693_Status" in record) {
    rows.push({
      code: "SSA-1693",
      label: "SSA-1693 — Fee Agreement",
      status: (get("SSA1693_Status") as string) || "Not sent",
      link: get("SSA1693_Link") as string | undefined,
      sentDate: get("SSA1693_Sent_Date") as string | undefined,
      signedDate: get("SSA1693_Signed_Date") as string | undefined,
    });
  }

  const mut = useMutation({
    mutationFn: (args: { code: FormCode; attested?: boolean }) =>
      send({ data: { caseId, code: args.code, attested: args.attested } }),
    onSuccess: (_d, args) => {
      toast.success(`${args.code} sent for signature`);
      qc.invalidateQueries({ queryKey: ["case", caseId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Send failed"),
  });

  const handleSend = (row: Row) => {
    if (row.requiresAttestation) {
      setAttested(false);
      setAttestOpen(true);
      return;
    }
    mut.mutate({ code: row.code });
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">SSA intake forms</h2>
        <span className="text-xs text-muted-foreground">SSA-1696 auto-sent when the case opens</span>
      </header>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.code} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-[260px] flex-1">
              <div className="font-medium">{r.label}</div>
              <div className="text-xs text-muted-foreground">
                {r.sentDate ? <>Sent {r.sentDate}</> : "Not sent"}
                {r.signedDate ? <> · Signed {r.signedDate}</> : null}
                {r.requiresAttestation && (
                  <> · <span className="text-amber-700">Requires SSA attestation before submission</span></>
                )}
              </div>
            </div>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(r.status)}`}>
              {r.status}
            </span>
            {r.releaseExpiringSoon && r.code === "SSA-827" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                <AlertTriangle className="h-3 w-3" /> Release expiring soon
              </span>
            )}
            {r.link && (
              <a href={r.link} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                View <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {r.status !== "Signed" && (
              <Button
                size="sm"
                variant={r.status === "Not sent" ? "default" : "outline"}
                disabled={mut.isPending}
                onClick={() => handleSend(r)}
              >
                {r.status === "Not sent" ? "Send" : "Resend"}
              </Button>
            )}
          </li>
        ))}
      </ul>

      <AlertDialog open={attestOpen} onOpenChange={setAttestOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              Attorney attestation required (SSA-827)
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <span className="block">
                SSA-827 is <strong>not</strong> on SSA's commercial e-signature list.
                Per POMS DI 11005.017 §C.6, a commercially e-signed 827 requires an
                attestation step (DI 11005.056D / DI 22501.007) before SSA will accept it.
              </span>
              <span className="block">
                By proceeding you confirm an authorized attorney has reviewed and will follow the
                SSA attestation procedure for this 827 before submission.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <Checkbox
              checked={attested}
              onCheckedChange={(v) => setAttested(v === true)}
              className="mt-0.5"
            />
            <span>I confirm the SSA-827 attestation procedure will be followed.</span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!attested || mut.isPending}
              onClick={(e) => {
                e.preventDefault();
                setAttestOpen(false);
                mut.mutate({ code: "SSA-827", attested: true });
              }}
            >
              Send SSA-827
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
