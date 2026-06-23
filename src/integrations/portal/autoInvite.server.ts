/**
 * autoInvite.server.ts — Issues a client-portal magic-link invite immediately
 * after lead conversion. Mirrors the logic in portal.functions inviteClientToPortal,
 * but is callable from other server functions (rather than only as an RPC).
 *
 * Service-role helper. The caller is responsible for authorization (it's invoked
 * by convertLead, which is already staff-gated).
 *
 * Side effects:
 *   1. Sends a magic-link sign-in email via supabaseAdmin.auth.admin.
 *   2. Upserts a client_portal_links row keyed by user_id with zoho_engagement_id set
 *      and zoho_case_id null (case doesn't exist yet — opens on retainer signature,
 *      at which point fillCaseIdOnLink fills it in).
 */

const FIRM_DOMAIN = "gatorlawpc.com";

export async function autoInvitePortal(args: {
  email: string;
  engagementId: string;
  invitedByUserId: string;
}): Promise<{ userId: string }> {
  const email = args.email.trim().toLowerCase();
  if (!email) throw new Error("autoInvitePortal: email required.");
  if (email.endsWith(`@${FIRM_DOMAIN}`)) {
    throw new Error("Refuse to enroll a firm-domain email as a client.");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const siteUrl =
    process.env.SITE_URL ??
    process.env.VITE_SITE_URL ??
    "https://gator-case-nexus.lovable.app";
  const redirectTo = `${siteUrl.replace(/\/$/, "")}/portal`;

  type AdminUser = { id: string; email?: string | null };
  let userId: string | undefined;
  const invite = await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (invite.error) {
    const msg = invite.error.message || "";
    if (/already|registered|exists/i.test(msg)) {
      const link = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });
      if (link.error) throw new Error(link.error.message);
      userId = (link.data?.user as AdminUser | null | undefined)?.id;
    } else {
      throw new Error(msg || "Failed to send invite.");
    }
  } else {
    userId = (invite.data?.user as AdminUser | null | undefined)?.id;
  }
  if (!userId) throw new Error("Invite sent but no user id returned.");

  const { error: upsertError } = await supabaseAdmin
    .from("client_portal_links")
    .upsert(
      {
        user_id: userId,
        email,
        zoho_case_id: null,
        zoho_engagement_id: args.engagementId,
        invited_by: args.invitedByUserId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (upsertError) throw new Error(upsertError.message);

  return { userId };
}

/**
 * Called from the retainer-signed hook once an SSDI case is opened.
 * Fills the zoho_case_id on any existing portal link for that engagement.
 */
export async function fillCaseIdOnLink(args: {
  engagementId: string;
  caseId: string;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("client_portal_links")
    .update({ zoho_case_id: args.caseId, updated_at: new Date().toISOString() })
    .eq("zoho_engagement_id", args.engagementId)
    .is("zoho_case_id", null);
  if (error) {
    console.error("[fillCaseIdOnLink] update failed", error);
  }
}
