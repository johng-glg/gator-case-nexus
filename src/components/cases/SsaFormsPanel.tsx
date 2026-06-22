/**
 * SsaFormsPanel — shows SSA-1696 + SSA-827 e-sign status on the case page, with
 * a Send/Resend button. Reads status fields off the case record (SSA1696_*, SSA827_*,
 * Release_Signed_Date, Release_Expiring_Soon). Hides Send when status is Signed.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { sendIntakeForm } from "@/lib/zoho.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink } from "lucide-react";

type FormCode = "SSA-1696" | "SSA-827";

interface Row {
  code: FormCode;
  label: string;
  status: string;
  requestId?: string;
  link?: string;
  sentDate?: string;
  signedDate?: string;
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

  const get = (k: string) => (record?.[k] as string | boolean | undefined);

  const rows: Row[] = [
    {
      code: "SSA-1696",
      label: "SSA-1696 — Appointment of Representative",
      status: (get("SSA1696_Status") as string) || "Not sent",
      requestId: get("SSA1696_Request_ID") as string | undefined,
      link: get("SSA1696_Link") as string | undefined,
      sentDate: get("SSA1696_Sent_Date") as string | undefined,
      signedDate: get("SSA1696_Signed_Date") as string | undefined,
    },
    {
      code: "SSA-827",
      label: "SSA-827 — Authorization to Disclose Information",
      status: (get("SSA827_Status") as string) || "Not sent",
      requestId: get("SSA827_Request_ID") as string | undefined,
      link: get("SSA827_Link") as string | undefined,
      sentDate: get("SSA827_Sent_Date") as string | undefined,
      signedDate: get("Release_Signed_Date") as string | undefined,
      releaseExpiringSoon: Boolean(get("Release_Expiring_Soon")),
    },
  ];

  const mut = useMutation({
    mutationFn: (code: FormCode) => send({ data: { caseId, code } }),
    onSuccess: (_d, code) => {
      toast.success(`${code} sent for signature`);
      qc.invalidateQueries({ queryKey: ["case", caseId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Send failed"),
  });

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">SSA intake forms</h2>
        <span className="text-xs text-muted-foreground">Auto-sent when the case opens</span>
      </header>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.code} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-[260px] flex-1">
              <div className="font-medium">{r.label}</div>
              <div className="text-xs text-muted-foreground">
                {r.sentDate ? <>Sent {r.sentDate}</> : "Not sent"}
                {r.signedDate ? <> · Signed {r.signedDate}</> : null}
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
                onClick={() => mut.mutate(r.code)}
              >
                {r.status === "Not sent" ? "Send" : "Resend"}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
