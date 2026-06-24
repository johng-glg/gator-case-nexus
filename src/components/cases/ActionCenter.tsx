/**
 * ActionCenter — prioritized list of next actions for a case.
 *
 * Layered:
 *  (E2) Evidence-readiness banner — first, when we're at a hearing stage
 *       and no records are received yet.
 *  (E1) Stage-aware suggestions — what an experienced CM would do at this
 *       exact stage (from stageSuggestions engine).
 *  (E3) "One-click" → suggestions with an advanceTo prefill the AdvanceStageDialog.
 *  Forms / tasks / docs / portal — the universal rows already shipped.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  CheckSquare,
  FileText,
  Mail,
  ShieldAlert,
  Send,
  ListTodo,
  ArrowRight,
  Info,
  Scale,
  CircleDollarSign,
  AlertTriangle,
} from "lucide-react";
import { sendIntakeForm } from "@/lib/zoho.functions";
import { listCaseRequests } from "@/lib/medicalRecords.functions";
import type { Stage } from "@/integrations/zoho/lifecycle";
import {
  getStageSuggestions,
  needsEvidenceGate,
  type StageSuggestion,
  type SuggestionIcon,
} from "@/integrations/zoho/stageSuggestions";

interface NextStepInline {
  title: string;
  description: string;
  cta?: { label: string; onClick: () => void };
}

interface Props {
  caseId: string;
  engagementId?: string;
  currentStage: Stage;
  ssa1696Status: string;
  ssa827Status: string;
  openTaskCount: number;
  hasPortalLink: boolean;
  onInvitePortal: () => void;
  onRequestDocuments: () => void;
  onScrollToTasks?: () => void;
  onScrollToRecords?: () => void;
  onScrollToDeadline?: () => void;
  onScrollToMessaging?: () => void;
  onScrollToForms?: () => void;
  onAdvance?: (nextStage?: Stage) => void;
  nextStep?: NextStepInline;
}

function suggestionIcon(kind: SuggestionIcon) {
  const cls = "h-4 w-4";
  switch (kind) {
    case "next":  return <ArrowRight className={`${cls} text-primary`} />;
    case "warn":  return <AlertTriangle className={`${cls} text-amber-600`} />;
    case "doc":   return <FileText className={`${cls} text-primary`} />;
    case "info":  return <Info className={`${cls} text-muted-foreground`} />;
    case "scale": return <Scale className={`${cls} text-primary`} />;
    case "money": return <CircleDollarSign className={`${cls} text-primary`} />;
  }
}

export function ActionCenter(props: Props) {
  const send = useServerFn(sendIntakeForm);
  const listRequests = useServerFn(listCaseRequests);
  const qc = useQueryClient();
  const [attestOpen, setAttestOpen] = useState(false);
  const [attested, setAttested] = useState(false);

  // E2: only need this when we're at a hearing stage; cheap query, ~1 row.
  const recordsQuery = useQuery({
    queryKey: ["case", props.caseId, "records-counts"],
    queryFn: () => listRequests({ data: { caseId: props.caseId } }),
    enabled: ["ALJ hearing requested", "Hearing scheduled", "Hearing held"].includes(props.currentStage),
    staleTime: 30_000,
  });
  const receivedCount = recordsQuery.data?.counts.received ?? 0;
  const evidenceGate = needsEvidenceGate(props.currentStage, receivedCount);

  const sendMut = useMutation({
    mutationFn: (args: { code: "SSA-1696" | "SSA-827"; attested?: boolean }) =>
      send({ data: { caseId: props.caseId, code: args.code, attested: args.attested } }),
    onSuccess: (_d, args) => {
      toast.success(`${args.code} sent for signature`);
      qc.invalidateQueries({ queryKey: ["case", props.caseId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Send failed"),
  });

  // E1: stage-aware suggestions.
  const stageRows = getStageSuggestions(props.currentStage);

  function handleSuggestion(s: StageSuggestion) {
    if (s.advanceTo) {
      // E3: one-click → preselect the stage in the Advance dialog
      props.onAdvance?.(s.advanceTo);
      return;
    }
    switch (s.scrollTo) {
      case "tasks": return props.onScrollToTasks?.();
      case "records": return props.onScrollToRecords?.();
      case "deadline": return props.onScrollToDeadline?.();
      case "messaging": return props.onScrollToMessaging?.();
      case "forms": return props.onScrollToForms?.();
    }
  }

  // Universal rows below the stage-aware ones.
  const universalRows: Array<{
    key: string;
    label: string;
    hint?: string;
    icon: React.ReactNode;
    button: { label: string; onClick: () => void; variant?: "default" | "outline" };
    tone?: "warn";
  }> = [];

  if (props.ssa1696Status !== "Signed") {
    universalRows.push({
      key: "1696",
      label: "Send SSA-1696",
      hint: props.ssa1696Status === "Sent" ? "Already sent — resend if needed" : "Appointment of Representative",
      icon: <Send className="h-4 w-4 text-primary" />,
      button: {
        label: props.ssa1696Status === "Sent" ? "Resend" : "Send",
        variant: props.ssa1696Status === "Not sent" ? "default" : "outline",
        onClick: () => sendMut.mutate({ code: "SSA-1696" }),
      },
    });
  }

  if (props.ssa827Status !== "Signed") {
    universalRows.push({
      key: "827",
      label: "SSA-827 — needs attestation",
      hint: "Attorney attestation required before sending (POMS DI 11005.017 §C.6)",
      icon: <ShieldAlert className="h-4 w-4 text-amber-600" />,
      tone: "warn",
      button: {
        label: props.ssa827Status === "Sent" ? "Resend" : "Send with attestation",
        variant: "outline",
        onClick: () => {
          setAttested(false);
          setAttestOpen(true);
        },
      },
    });
  }

  universalRows.push({
    key: "tasks",
    label: `Open tasks (${props.openTaskCount})`,
    hint: props.openTaskCount === 0 ? "No open tasks — nice." : "Jump to task list",
    icon: <ListTodo className="h-4 w-4 text-primary" />,
    button: {
      label: "View",
      variant: "outline",
      onClick: () => props.onScrollToTasks?.(),
    },
  });

  universalRows.push({
    key: "docs",
    label: "Request documents from client",
    hint: "Send the client an upload checklist",
    icon: <FileText className="h-4 w-4 text-primary" />,
    button: {
      label: "Request",
      variant: "outline",
      onClick: () => props.onRequestDocuments(),
    },
  });

  if (!props.hasPortalLink) {
    universalRows.push({
      key: "portal",
      label: "Invite client to portal",
      hint: "Sends a secure magic-link email",
      icon: <Mail className="h-4 w-4 text-primary" />,
      button: {
        label: "Invite",
        variant: "outline",
        onClick: () => props.onInvitePortal(),
      },
    });
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Action center</div>
          <h2 className="mt-0.5 text-base font-semibold">
            {props.nextStep ? props.nextStep.title : "Next on this case"}
          </h2>
          {props.nextStep && (
            <p className="mt-1 text-sm text-muted-foreground">{props.nextStep.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {props.nextStep?.cta && (
            <Button size="sm" onClick={props.nextStep.cta.onClick}>
              {props.nextStep.cta.label}
            </Button>
          )}
          <CheckSquare className="h-4 w-4 text-muted-foreground" />
        </div>
      </header>


      {/* E2 — evidence-readiness banner */}
      {evidenceGate && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700/50 dark:bg-amber-950/30 p-3 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Evidence not ready for hearing
            </div>
            <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
              No medical records are marked received on this case. Don&rsquo;t let
              this reach a hearing without evidence — request and follow up now,
              and honor the 5-day rule (HALLEX I-2-6-58).
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => props.onScrollToRecords?.()}>
            Records
          </Button>
        </div>
      )}

      {/* E1 — stage-aware rows */}
      {stageRows.length > 0 && (
        <ul className="divide-y divide-border">
          {stageRows.map((s) => (
            <li key={s.key} className="flex items-start gap-3 py-2.5">
              <div className="mt-0.5">{suggestionIcon(s.icon)}</div>
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-medium ${s.tone === "warn" ? "text-amber-700 dark:text-amber-300" : "text-foreground"}`}>
                  {s.label}
                </div>
                {s.hint && <div className="text-xs text-muted-foreground mt-0.5">{s.hint}</div>}
              </div>
              {(s.advanceTo || s.scrollTo) && (
                <Button
                  size="sm"
                  variant={s.advanceTo ? "default" : "outline"}
                  onClick={() => handleSuggestion(s)}
                >
                  {s.advanceTo ? "Advance" : "Open"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Universal rows */}
      <ul className="divide-y divide-border">
        {universalRows.map((r) => (
          <li key={r.key} className="flex items-start gap-3 py-2.5">
            <div className="mt-0.5">{r.icon}</div>
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-medium ${r.tone === "warn" ? "text-amber-700 dark:text-amber-300" : "text-foreground"}`}>
                {r.label}
              </div>
              {r.hint && <div className="text-xs text-muted-foreground mt-0.5">{r.hint}</div>}
            </div>
            <Button
              size="sm"
              variant={r.button.variant ?? "outline"}
              disabled={sendMut.isPending}
              onClick={r.button.onClick}
            >
              {r.button.label}
            </Button>
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
