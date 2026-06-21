/**
 * InviteClientButton — staff-only. Opens a dialog that lets an attorney email a
 * magic-link portal invite to the client of the current case.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  inviteClientToPortal,
  getPortalLinkForCase,
} from "@/lib/portal.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

export function InviteClientButton({
  caseId,
  engagementId,
  defaultEmail,
}: {
  caseId: string;
  engagementId?: string;
  defaultEmail?: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const queryClient = useQueryClient();

  const invite = useServerFn(inviteClientToPortal);
  const getLink = useServerFn(getPortalLinkForCase);

  const existing = useQuery({
    queryKey: ["portal-link", caseId],
    queryFn: () => getLink({ data: { caseId } }),
  });

  const mutation = useMutation({
    mutationFn: () =>
      invite({ data: { email: email.trim(), caseId, engagementId } }),
    onSuccess: () => {
      toast.success(`Portal invite sent to ${email.trim()}.`);
      queryClient.invalidateQueries({ queryKey: ["portal-link", caseId] });
      setOpen(false);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Couldn't send invite.");
    },
  });

  const linked = existing.data?.link?.email;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="h-3.5 w-3.5 mr-1.5" />
          {linked ? "Re-send portal invite" : "Invite to portal"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Client portal invite</DialogTitle>
          <DialogDescription>
            Sends a one-click sign-in link by email. The client will see read-only case
            status, current stage, and upcoming deadlines — no fees, no notes.
            {linked ? (
              <span className="block mt-2 text-foreground">
                Currently linked: <strong>{linked}</strong>. Sending again will replace
                the previous link.
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) mutation.mutate();
          }}
          className="space-y-3"
        >
          <label className="block text-sm">
            <span className="text-muted-foreground">Client email</span>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@example.com"
              className="mt-1"
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending || !email.trim()}>
              {mutation.isPending ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
