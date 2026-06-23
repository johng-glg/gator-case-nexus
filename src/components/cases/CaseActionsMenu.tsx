/**
 * CaseActionsMenu — overflow (⋯) menu in the case page header.
 *
 * Houses secondary actions so the header itself stays focused on Advance Stage:
 *   - Invite to portal (manual fallback)
 *   - Recompute deadline
 *   - Fee petition draft (only shown for award stages)
 *   - Run intake playbook (admin only)
 *   - Seed test data (admin only)
 */
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { MoreHorizontal, RefreshCw, Mail, PlayCircle, FlaskConical, ScrollText } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  caseRecomputeDeadline,
  runCaseIntakePlaybook,
  seedTestCaseData,
} from "@/lib/zoho.functions";
import { inviteClientToPortal, getPortalLinkForCase } from "@/lib/portal.functions";
import type { Stage } from "@/integrations/zoho/lifecycle";

interface Props {
  caseId: string;
  engagementId?: string;
  stage: Stage;
  isAdmin: boolean;
}

export function CaseActionsMenu({ caseId, engagementId, stage, isAdmin }: Props) {
  const qc = useQueryClient();
  const recompute = useServerFn(caseRecomputeDeadline);
  const seedTestCase = useServerFn(seedTestCaseData);
  const runPlaybook = useServerFn(runCaseIntakePlaybook);
  const invite = useServerFn(inviteClientToPortal);
  const getLink = useServerFn(getPortalLinkForCase);
  const [busy, setBusy] = useState<string | null>(null);

  const linkQ = useQuery({
    queryKey: ["portal-link", caseId],
    queryFn: () => getLink({ data: { caseId } }),
  });
  const linkedEmail = linkQ.data?.link?.email as string | undefined;

  const inviteMut = useMutation({
    // No email — the server resolves it from the Contact on file in Zoho.
    mutationFn: () => invite({ data: { caseId, engagementId } }),
    onSuccess: (res) => {
      const sentTo = (res as { email?: string } | undefined)?.email ?? linkedEmail ?? "the client";
      toast.success(
        (res as { resent?: boolean } | undefined)?.resent
          ? `Re-sent portal sign-in link to ${sentTo}.`
          : `Portal invite sent to ${sentTo}.`,
      );
      qc.invalidateQueries({ queryKey: ["portal-link", caseId] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Couldn't send invite.");
    },
  });

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["case", caseId] }),
      qc.invalidateQueries({ queryKey: ["case-activity", caseId] }),
      qc.invalidateQueries({ queryKey: ["tasks", caseId] }),
      qc.invalidateQueries({ queryKey: ["case-docs", caseId] }),
    ]);
  };

  const showFeePetition = stage === "Award / NOA received" || stage === "Fee petition filed";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" aria-label="More case actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>Case actions</DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setInviteOpen(true);
            }}
          >
            <Mail className="mr-2 h-4 w-4" /> Re-send portal invite
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={busy !== null}
            onSelect={async (e) => {
              e.preventDefault();
              setBusy("recompute");
              try {
                await recompute({ data: { caseId } });
                await refresh();
                toast.success("Deadline recomputed.");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(null);
              }
            }}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${busy === "recompute" ? "animate-spin" : ""}`} /> Recompute deadline
          </DropdownMenuItem>
          {showFeePetition && (
            <DropdownMenuItem asChild>
              <Link to="/practices/ssdi/cases/$caseId/fee-petition" params={{ caseId }}>
                <ScrollText className="mr-2 h-4 w-4" /> Fee petition draft
              </Link>
            </DropdownMenuItem>
          )}
          {isAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Admin tools
              </DropdownMenuLabel>
              <DropdownMenuItem
                disabled={busy !== null}
                onSelect={async (e) => {
                  e.preventDefault();
                  setBusy("playbook");
                  const t = toast.loading("Running intake playbook…");
                  try {
                    const out = await runPlaybook({ data: { caseId } });
                    await refresh();
                    const results = out.results as Array<{ status: string }>;
                    const okCount = results.filter((r) => r.status === "ok").length;
                    const errCount = results.filter((r) => r.status === "error").length;
                    toast.dismiss(t);
                    if (errCount > 0) toast.warning(`Playbook ran with ${errCount} error(s). Check activity log.`);
                    else toast.success(`Playbook ran — ${okCount} step(s) completed.`);
                  } catch (err) {
                    toast.dismiss(t);
                    toast.error(err instanceof Error ? err.message : String(err));
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                <PlayCircle className="mr-2 h-4 w-4" /> Run intake playbook
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={busy !== null}
                onSelect={async (e) => {
                  e.preventDefault();
                  setBusy("seed");
                  try {
                    await seedTestCase({ data: { caseId } });
                    await refresh();
                    toast.success("Test data populated.");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : String(err));
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                <FlaskConical className="mr-2 h-4 w-4" /> Seed test data
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Client portal invite</DialogTitle>
            <DialogDescription>
              Sends a one-click sign-in link by email. The client will see read-only case
              status, current stage, and upcoming deadlines — no fees, no notes.
              {linkedEmail ? (
                <span className="block mt-2 text-foreground">
                  Currently linked: <strong>{linkedEmail}</strong>. Sending again will replace
                  the previous link.
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (inviteEmail.trim()) inviteMut.mutate();
            }}
            className="space-y-3"
          >
            <label className="block text-sm">
              <span className="text-muted-foreground">Client email</span>
              <Input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="client@example.com"
                className="mt-1"
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={inviteMut.isPending || !inviteEmail.trim()}>
                {inviteMut.isPending ? "Sending…" : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}


