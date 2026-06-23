/**
 * AppealFormsPanel — surfaces the appeal form(s) triggered by the current
 * denial stage. Shows official PDF link, the merge-field preview the back-end
 * service will use to pre-fill the form, and a one-click copy of the JSON
 * payload so the rep can hand it off (or our service can ingest it).
 */
import { useState } from "react";
import { FileText, ExternalLink, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  appealFormsForStage,
  mergeFieldsForForm,
  APPEAL_FORMS,
  type AppealForm,
} from "@/integrations/zoho/appealForms";
import type { Stage } from "@/integrations/zoho/lifecycle";

interface Props {
  stage: Stage;
  record: Record<string, unknown>;
  clientName: string | undefined;
}

export function AppealFormsPanel({ stage, record, clientName }: Props) {
  const forms = appealFormsForStage(stage);
  if (forms.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);
  const ctx = {
    clientFullName: clientName ?? "",
    ssn: (record.SSN as string | undefined) ?? undefined,
    claimNumber: (record.SSA_Claim_Number as string | undefined) ?? undefined,
    today,
    priorDecisionDate: (record.Initial_Decision_Date as string | undefined) ?? undefined,
    reconDenialDate: (record.Recon_Decision_Date as string | undefined) ?? undefined,
    aljDecisionDate: (record.ALJ_Decision_Date as string | undefined) ?? undefined,
  };

  return (
    <section className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Appeal forms — ready to file</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        These forms are triggered by stage <span className="font-medium text-foreground">{stage}</span>.
        Open the official SSA PDF, or copy the merge JSON to pre-fill via Zoho Writer / your form service.
      </p>
      <div className="space-y-3">
        {forms.map((code) => (
          <FormCard key={code} code={code} merge={mergeFieldsForForm(code, ctx)} />
        ))}
      </div>
    </section>
  );
}

function FormCard({ code, merge }: { code: AppealForm; merge: Record<string, string> }) {
  const spec = APPEAL_FORMS[code];
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(merge, null, 2);

  async function copy() {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-md border border-border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">{spec.label}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {spec.tier} · Signer: {spec.signer}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={spec.url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Official PDF
            </a>
          </Button>
          <Button size="sm" variant="outline" onClick={copy}>
            {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
            {copied ? "Copied" : "Copy merge JSON"}
          </Button>
        </div>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Merge fields ({Object.keys(merge).length})
        </summary>
        <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted/40 p-2 text-[11px] leading-snug font-mono">
{json}
        </pre>
        {spec.fields.some((f) => !(f in merge)) && (
          <p className="mt-2 text-amber-700 dark:text-amber-400">
            Missing on case: {spec.fields.filter((f) => !(f in merge)).join(", ")}
          </p>
        )}
      </details>
    </div>
  );
}
