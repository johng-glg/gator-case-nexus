/**
 * InvitePortalButton — staff-only. One-click portal invite for the client.
 *
 * Sends a magic-link sign-in to the email on file in Zoho for the Contact.
 * Accepts any of contactId / engagementId / caseId — the server resolves the
 * Contact from whichever is provided. No email prompt, no dialog.
 */
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { inviteClientToPortal } from "@/lib/portal.functions";

interface Props {
  contactId?: string;
  engagementId?: string;
  caseId?: string;
  /** When known, shown in the button label so staff see who gets the email. */
  knownEmail?: string;
  size?: "sm" | "default";
  variant?: "outline" | "default";
}

export function InvitePortalButton({
  contactId,
  engagementId,
  caseId,
  knownEmail,
  size = "sm",
  variant = "outline",
}: Props) {
  const invite = useServerFn(inviteClientToPortal);
  const mut = useMutation({
    mutationFn: () => invite({ data: { contactId, engagementId, caseId } }),
    onSuccess: (res) => {
      const sent = (res as { email?: string; resent?: boolean } | undefined) ?? {};
      const to = sent.email ?? knownEmail ?? "the client";
      toast.success(
        sent.resent
          ? `Re-sent portal sign-in link to ${to}.`
          : `Portal invite sent to ${to}.`,
      );
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Couldn't send invite.");
    },
  });

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={mut.isPending}
      onClick={() => mut.mutate()}
      title={knownEmail ? `Sends to ${knownEmail}` : "Sends to the client's email on file"}
    >
      {mut.isPending ? (
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
      ) : (
        <Mail className="h-3.5 w-3.5 mr-1.5" />
      )}
      {mut.isPending ? "Sending…" : "Invite to portal"}
    </Button>
  );
}
