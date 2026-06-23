/**
 * ActionCenter — prioritized list of next actions for a case.
 *
 * Rendered above-the-fold on the right side of the case page when no appeal
 * clock is active (or paired with the Deadline panel when one is). Each row
 * = label + inline button so staff can act without scrolling.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";
import { sendIntakeForm } from "@/lib/zoho.functions";

interface Props {
  caseId: string;
  engagementId?: string;
  ssa1696Status: string;
  ssa827Status: string;
  openTaskCount: number;
  hasPortalLink: boolean;
  onInvitePortal: () => void;
  onRequestDocuments: () => void;
  onScrollToTasks?: () => void;
}

export function ActionCenter(props: Props) {
  const send = useServerFn(sendIntakeForm);
  const qc = useQueryClient();
  const [attestOpen, setAttestOpen] = useState(false);
  const [attested, setAttested] = useState(false);

  const sendMut = useMutation({
    mutationFn: (args: { code: "SSA-1696" | "SSA-827"; attested?: boolean }) =>
      send({ data: { caseId: props.caseId, code: args.code, attested: args.attested } }),
    onSuccess: (_d, args) => {
      toast.success(`${args.code} sent for signature`);
      qc.invalidateQueries({ queryKey: ["case", props.caseId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Send failed"),
  });

  const rows: Array<{
    key: string;
    label: string;
    hint?: string;
    icon: React.ReactNode;
    button: { label: string; onClick: () => void; variant?: "default" | "outline" };
    tone?: "warn";
  }> = [];

  if (props.ssa1696Status !== "Signed") {
    rows.push({
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
    rows.push({
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

  rows.push({
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

  rows.push({
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
    rows.push({
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
      <header className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Action center</div>
          <h2 className="mt-0.5 text-base font-semibold">Next on this case</h2>
        </div>
        <CheckSquare className="h-4 w-4 text-muted-foreground" />
      </header>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
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
