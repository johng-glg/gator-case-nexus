/**
 * autoInvite.server.ts — Issues a passwordless client-portal invite (Supabase
 * invite OR magic link) and links the resulting auth user to a Zoho CONTACT.
 *
 * The portal is contact-keyed (one login → all the client's matters across
 * practices). This replaces the case-keyed model in `client_portal_links`.
 *
 * Service-role helper. Callers are responsible for authorization.
 */

const FIRM_DOMAIN = "gatorlawpc.com";

function siteUrl(): string {
  return (
    process.env.SITE_URL ??
    process.env.VITE_SITE_URL ??
    "https://gator-case-nexus.lovable.app"
  ).replace(/\/$/, "");
}

export async function autoInvitePortal(args: {
  email: string;
  /** Zoho Contact id — the durable key for the portal account. */
  contactId: string;
  /** Optional Zoho Engagement id — written to the legacy `client_portal_links`
   *  table so existing case-keyed callers (documents, messaging) keep working
   *  during the contact-keyed migration. */
  engagementId?: string;
  invitedByUserId: string;
}): Promise<{ userId: string; resent: boolean }> {
  const email = args.email.trim().toLowerCase();
  if (!email) throw new Error("autoInvitePortal: email required.");
  if (!args.contactId) throw new Error("autoInvitePortal: contactId required.");
  if (email.endsWith(`@${FIRM_DOMAIN}`)) {
    throw new Error("Refuse to enroll a firm-domain email as a client.");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const redirectTo = `${siteUrl()}/portal`;

  // If this contact already has a portal account, just (re)send a magic link.
  const { data: existing } = await supabaseAdmin
    .from("client_portal_contacts")
    .select("user_id, email")
    .eq("zoho_contact_id", args.contactId)
    .maybeSingle();

  type AdminUser = { id: string; email?: string | null };
  let userId: string | undefined;
  let resent = false;

  if (existing) {
    // Refresh the link so the client can come back in.
    const link = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: existing.email,
      options: { redirectTo },
    });
    if (link.error) throw new Error(link.error.message);
    userId = existing.user_id;
    resent = true;
  } else {
    // First-time invite (also lets us auto-create the auth user if needed).
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
        resent = true;
      } else {
        throw new Error(msg || "Failed to send invite.");
      }
    } else {
      userId = (invite.data?.user as AdminUser | null | undefined)?.id;
    }
    if (!userId) throw new Error("Invite sent but no user id returned.");

    const { error: upsertError } = await supabaseAdmin
      .from("client_portal_contacts")
      .upsert(
        {
          user_id: userId,
          email,
          zoho_contact_id: args.contactId,
          invited_by: args.invitedByUserId === "00000000-0000-0000-0000-000000000000"
            ? null
            : args.invitedByUserId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (upsertError) throw new Error(upsertError.message);
  }

  // Backward-compat: keep the legacy case-keyed table populated so existing
  // documents/messaging code that joins on `client_portal_links` keeps working.
  // Safe to remove once all callers migrate to `client_portal_contacts`.
  if (args.engagementId) {
    await supabaseAdmin
      .from("client_portal_links")
      .upsert(
        {
          user_id: userId!,
          email,
          zoho_case_id: null,
          zoho_engagement_id: args.engagementId,
          invited_by: args.invitedByUserId === "00000000-0000-0000-0000-000000000000"
            ? null
            : args.invitedByUserId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
  }

  return { userId: userId!, resent };
}

/**
 * Mark a per-matter intake step (currently: questionnaire completion) on the
 * contact's portal row. Stored as a small jsonb map keyed by engagement id.
 */
export async function markIntakeState(args: {
  contactId: string;
  engagementId: string;
  key: "questionnaire_completed_at";
  value: string | null;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("client_portal_contacts")
    .select("id, intake_state")
    .eq("zoho_contact_id", args.contactId)
    .maybeSingle();
  if (!row) return;
  const current = (row.intake_state ?? {}) as Record<string, Record<string, string | null>>;
  const bucket = { ...(current[args.engagementId] ?? {}), [args.key]: args.value };
  const next = { ...current, [args.engagementId]: bucket };
  await supabaseAdmin
    .from("client_portal_contacts")
    .update({ intake_state: next, updated_at: new Date().toISOString() })
    .eq("id", row.id);
}
