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
import { useQueryClient } from "@tanstack/react-query";
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
import { Button } from "@/components/ui/button";
import {
  caseRecomputeDeadline,
  runCaseIntakePlaybook,
  seedTestCaseData,
} from "@/lib/zoho.functions";
import type { Stage } from "@/integrations/zoho/lifecycle";

interface Props {
  caseId: string;
  stage: Stage;
  isAdmin: boolean;
  onInvitePortal?: () => void;
}

export function CaseActionsMenu({ caseId, stage, isAdmin, onInvitePortal }: Props) {
  const qc = useQueryClient();
  const recompute = useServerFn(caseRecomputeDeadline);
  const seedTestCase = useServerFn(seedTestCaseData);
  const runPlaybook = useServerFn(runCaseIntakePlaybook);
  const [busy, setBusy] = useState<string | null>(null);

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label="More case actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Case actions</DropdownMenuLabel>
        {onInvitePortal && (
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onInvitePortal(); }}>
            <Mail className="mr-2 h-4 w-4" /> Invite to portal
          </DropdownMenuItem>
        )}
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
                  const okCount = out.results.filter((r) => r.status === "ok").length;
                  const errCount = out.results.filter((r) => r.status === "error").length;
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
  );
}
