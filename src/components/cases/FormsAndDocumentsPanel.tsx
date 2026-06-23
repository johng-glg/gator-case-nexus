/**
 * FormsAndDocumentsPanel — single source of truth for the SSA intake forms
 * and the retainer. Combines e-sign status (Not sent/Sent/Signed) with the
 * firm's checklist status (To do/Sent/Received/Filed) so each form has ONE
 * row instead of appearing in both DocumentChecklist and SsaFormsPanel.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ExternalLink, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { sendIntakeForm, markIntakeFormSigned } from "@/lib/zoho.functions";
import { listCaseDocuments, setDocumentStatus } from "@/lib/caseDocuments.functions";
import { DOC_STATUSES, type DocStatus } from "@/integrations/zoho/documents";
import type { Stage } from "@/integrations/zoho/lifecycle";
import { cn } from "@/lib/utils";

type FormCode = "SSA-1696" | "SSA-827" | "SSA-1693" | "retainer";

interface Props {
  caseId: string;
  stage: Stage;
  record: Record<string, unknown> | undefined;
  retainerStatus?: string;
  retainerSignedDate?: string;
}

const eSignBadge = (status: string) => {
  switch (status) {
    case "Signed":
    case "Completed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "Sent":
    case "Out for signature":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "Declined":
      return "bg-rose-100 text-rose-800 border-rose-200";
    case "Expired":
      return "bg-amber-100 text-amber-800 border-amber-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
};

const checklistStyles: Record<DocStatus, string> = {
  "To do": "bg-muted text-muted-foreground border-border",
  Sent: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  Received: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
  Filed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
};

export function FormsAndDocumentsPanel({
  caseId,
  stage,
  record,
  retainerStatus,
  retainerSignedDate,
}: Props) {
  const send = useServerFn(sendIntakeForm);
  const markSigned = useServerFn(markIntakeFormSigned);
  const listFn = useServerFn(listCaseDocuments);
  const setFn = useServerFn(setDocumentStatus);
  const qc = useQueryClient();
  const [attestOpen, setAttestOpen] = useState(false);
  const [attested, setAttested] = useState(false);

  const docsQuery = useQuery({
    queryKey: ["case-docs", caseId, stage],
    queryFn: () => listFn({ data: { caseId, currentStage: stage } }),
  });

  const setStatusMut = useMutation({
    mutationFn: (vars: { docCode: string; status: DocStatus }) =>
      setFn({ data: { caseId, docCode: vars.docCode, status: vars.status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case-docs", caseId] });
      qc.invalidateQueries({ queryKey: ["case-activity", caseId] });
    },
  });

  const sendMut = useMutation({
    mutationFn: (args: { code: "SSA-1696" | "SSA-827" | "SSA-1693"; attested?: boolean }) =>
      send({ data: { caseId, code: args.code, attested: args.attested } }),
    onSuccess: (_d, args) => {
      toast.success(`${args.code} sent for signature`);
      qc.invalidateQueries({ queryKey: ["case", caseId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Send failed"),
  });

  const markSignedMut = useMutation({
    mutationFn: (args: { code: "SSA-1696" | "SSA-827" | "SSA-1693" }) =>
      markSigned({ data: { caseId, code: args.code } }),
    onSuccess: (_d, args) => {
      toast.success(`${args.code} marked as signed`);
      qc.invalidateQueries({ queryKey: ["case", caseId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const get = (k: string) => record?.[k] as string | boolean | undefined;
  const releaseExpiringSoon = Boolean(get("Release_Expiring_Soon"));

  type Row = {
    code: FormCode;
    label: string;
    eSignStatus: string;
    link?: string;
    sentDate?: string;
    signedDate?: string;
    expirationDate?: string;
    requiresAttestation?: boolean;
    canResend: boolean;
  };

  const rows: Row[] = [
    {
      code: "retainer",
      label: "Gator retainer agreement",
      eSignStatus: retainerStatus ?? "Not sent",
      signedDate: retainerSignedDate,
      canResend: false, // retainer flow lives on the engagement page
    },
    {
      code: "SSA-1696",
      label: "SSA-1696 — Appointment of Representative",
      eSignStatus: (get("SSA1696_Status") as string) || "Not sent",
      link: get("SSA1696_Link") as string | undefined,
      sentDate: get("SSA1696_Sent_Date") as string | undefined,
      signedDate: get("SSA1696_Signed_Date") as string | undefined,
      canResend: true,
    },
    {
      code: "SSA-827",
      label: "SSA-827 — Authorization to Disclose Information (HIPAA release)",
      eSignStatus: (get("SSA827_Status") as string) || "Not sent",
      link: get("SSA827_Link") as string | undefined,
      sentDate: get("SSA827_Sent_Date") as string | undefined,
      signedDate: get("Release_Signed_Date") as string | undefined,
      expirationDate: get("Release_Expiration_Date") as string | undefined,
      requiresAttestation: true,
      canResend: true,
    },
  ];
  if (record && "SSA1693_Status" in record) {
    rows.push({
      code: "SSA-1693",
      label: "SSA-1693 — Fee Agreement",
      eSignStatus: (get("SSA1693_Status") as string) || "Not sent",
      link: get("SSA1693_Link") as string | undefined,
      sentDate: get("SSA1693_Sent_Date") as string | undefined,
      signedDate: get("SSA1693_Signed_Date") as string | undefined,
      canResend: true,
    });
  }

  // Map of checklist rows by code, so each form can display its checklist status inline.
  const checklistByCode = new Map((docsQuery.data ?? []).map((d) => [d.code, d]));

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Forms &amp; documents</h2>
        <span className="text-xs text-muted-foreground">
          E-sign status + firm checklist status, in one place
        </span>
      </header>
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Form</th>
              <th className="px-3 py-2 text-left font-medium">E-sign</th>
              <th className="px-3 py-2 text-left font-medium">Checklist</th>
              <th className="px-3 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const checklist = checklistByCode.get(r.code);
              const showSendBtn = r.canResend && r.eSignStatus !== "Signed";
              return (
                <tr key={r.code} className="align-top">
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{r.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 space-x-1.5">
                      {r.sentDate && <span>Sent {r.sentDate}</span>}
                      {r.signedDate && <span>· Signed {r.signedDate}</span>}
                      {r.expirationDate && <span>· Expires {r.expirationDate}</span>}
                      {r.requiresAttestation && r.eSignStatus !== "Signed" && (
                        <span className="text-amber-700">· Requires SSA attestation</span>
                      )}
                      {r.code === "SSA-827" && releaseExpiringSoon && (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <AlertTriangle className="h-3 w-3" /> Release expiring soon
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${eSignBadge(r.eSignStatus)}`}>
                      {r.eSignStatus}
                    </span>
                    {r.link && (
                      <a
                        href={r.link}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline"
                      >
                        View <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {DOC_STATUSES.map((s) => {
                        const active = checklist?.status === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            disabled={!checklist || setStatusMut.isPending}
                            onClick={() => checklist && setStatusMut.mutate({ docCode: r.code, status: s })}
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded border transition-colors disabled:opacity-50",
                              active
                                ? checklistStyles[s] + " font-medium"
                                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50",
                            )}
                            title={!checklist ? "Not in current phase checklist" : `Mark ${s}`}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {showSendBtn ? (
                      <Button
                        size="sm"
                        variant={r.eSignStatus === "Not sent" ? "default" : "outline"}
                        disabled={sendMut.isPending}
                        onClick={() => {
                          if (r.requiresAttestation) {
                            setAttested(false);
                            setAttestOpen(true);
                          } else if (r.code !== "retainer") {
                            sendMut.mutate({ code: r.code });
                          }
                        }}
                      >
                        {r.eSignStatus === "Not sent" ? "Send" : "Resend"}
                      </Button>
                    ) : r.code === "retainer" ? (
                      <span className="text-[11px] text-muted-foreground">on engagement</span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AlertDialog open={attestOpen} onOpenChange={setAttestOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              Attorney attestation required (SSA-827)
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <span className="block">
                SSA-827 is <strong>not</strong> on SSA&rsquo;s commercial
                e-signature list. Per POMS DI 11005.017 §C.6, a commercially
                e-signed 827 requires an attestation step before SSA will
                accept it.
              </span>
              <span className="block">
                By proceeding you confirm an authorized attorney has reviewed
                and will follow the SSA attestation procedure for this 827
                before submission.
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
              disabled={!attested || sendMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                setAttestOpen(false);
                sendMut.mutate({ code: "SSA-827", attested: true });
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
