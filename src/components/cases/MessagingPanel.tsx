/**
 * MessagingPanel.tsx — Per-case messaging panel (staff).
 *
 * Shows consent status, queued drafts (with edit/send/discard), and recent
 * sent messages. All data loaded via `listCaseMessages` server fn.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listCaseMessages,
  sendHeldMessage,
  discardHeldMessage,
} from "@/lib/messaging.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { MailCheck, MailWarning, Mail, Send, X, Clock } from "lucide-react";

export function MessagingPanel({ caseId }: { caseId: string }) {
  const list = useServerFn(listCaseMessages);
  const send = useServerFn(sendHeldMessage);
  const discard = useServerFn(discardHeldMessage);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["case-messages", caseId],
    queryFn: () => list({ data: { caseId } }),
  });

  const sendMut = useMutation({
    mutationFn: (v: { heldId: string; subject?: string; body?: string }) =>
      send({ data: v }),
    onSuccess: () => {
      toast.success("Email sent.");
      qc.invalidateQueries({ queryKey: ["case-messages", caseId] });
      qc.invalidateQueries({ queryKey: ["case-activity", caseId] });
    },
    onError: (e) => toast.error(`Send failed: ${(e as Error).message}`),
  });

  const discardMut = useMutation({
    mutationFn: (heldId: string) => discard({ data: { heldId } }),
    onSuccess: () => {
      toast.success("Draft discarded.");
      qc.invalidateQueries({ queryKey: ["case-messages", caseId] });
      qc.invalidateQueries({ queryKey: ["case-activity", caseId] });
    },
  });

  if (query.isLoading) {
    return <PanelShell><p className="text-sm text-muted-foreground">Loading…</p></PanelShell>;
  }
  if (query.error) {
    return <PanelShell><p className="text-sm text-destructive">{(query.error as Error).message}</p></PanelShell>;
  }
  const d = query.data!;

  return (
    <PanelShell>
      {/* Consent */}
      {!d.hasPortalLink ? (
        <p className="text-xs text-muted-foreground">
          No client portal link — invite the client to enable case-update emails.
        </p>
      ) : (
        <div className="flex items-center gap-2 text-xs">
          {d.consent?.emailOptedOutAt ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">
              <MailWarning className="h-3 w-3" /> Email opted out
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
              <MailCheck className="h-3 w-3" /> Email opted in
            </span>
          )}
          {d.clientEmail ? <span className="text-muted-foreground truncate">{d.clientEmail}</span> : null}
        </div>
      )}

      {/* Held drafts */}
      {d.held.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground">Drafts awaiting review</h4>
          {d.held.map((h: any) => (
            <HeldDraft
              key={h.id}
              draft={h}
              sending={sendMut.isPending}
              onSend={(subject, body) => sendMut.mutate({ heldId: h.id, subject, body })}
              onDiscard={() => discardMut.mutate(h.id)}
            />
          ))}
        </div>
      ) : null}

      {/* History */}
      <div className="space-y-2">
        <h4 className="text-xs uppercase tracking-wider text-muted-foreground">Recent messages</h4>
        {d.history.length === 0 ? (
          <p className="text-xs text-muted-foreground">No messages yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {d.history.slice(0, 8).map((row: any) => (
              <li key={row.id} className="flex items-start gap-2 text-xs">
                <HistoryIcon action={row.action} />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{row.summary}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PanelShell>
  );
}

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-4">
      <header className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-primary" />
        <h3 className="font-medium text-sm">Client messaging</h3>
      </header>
      {children}
    </section>
  );
}

function HeldDraft({
  draft,
  sending,
  onSend,
  onDiscard,
}: {
  draft: any;
  sending: boolean;
  onSend: (subject: string, body: string) => void;
  onDiscard: () => void;
}) {
  const [subject, setSubject] = useState<string>(draft.subject);
  const [body, setBody] = useState<string>(draft.body);
  return (
    <div className="rounded-md border border-border bg-background p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {draft.reason} · to {draft.recipient_email}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {new Date(draft.created_at).toLocaleString()}
        </span>
      </div>
      <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        className="text-sm"
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDiscard} disabled={sending}>
          <X className="h-3.5 w-3.5 mr-1" /> Discard
        </Button>
        <Button size="sm" onClick={() => onSend(subject, body)} disabled={sending || !subject.trim() || !body.trim()}>
          <Send className="h-3.5 w-3.5 mr-1" /> Send
        </Button>
      </div>
    </div>
  );
}

function HistoryIcon({ action }: { action: string }) {
  if (action === "message.sent") return <MailCheck className="h-3.5 w-3.5 text-emerald-600 mt-0.5" />;
  if (action === "message.discarded") return <X className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />;
  return <Clock className="h-3.5 w-3.5 text-amber-600 mt-0.5" />;
}
