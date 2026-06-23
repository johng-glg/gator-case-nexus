/**
 * autoInvite.server.ts — Issues a passwordless client-portal invite (invite OR
 * magic link) and links the resulting auth user to a Zoho CONTACT.
 *
 * The portal is contact-keyed (one login → all the client's matters across
 * practices). This replaces the case-keyed model in `client_portal_links`.
 *
 * Service-role helper. Callers are responsible for authorization.
 */

const FIRM_DOMAIN = "gatorlawpc.com";
const SITE_NAME = "Gator Law";
const SENDER_DOMAIN = "notify.gatorlawpc.com";
const FROM_DOMAIN = "notify.gatorlawpc.com";

function siteUrl(): string {
  return (
    process.env.SITE_URL ??
    process.env.VITE_SITE_URL ??
    "https://gator-case-nexus.lovable.app"
  ).replace(/\/$/, "");
}

type GeneratedLinkData = {
  user?: { id?: string; email?: string | null } | null;
  properties?: {
    action_link?: string | null;
    email_otp?: string | null;
  } | null;
};

async function enqueuePortalAuthEmail(args: {
  email: string;
  emailType: "invite" | "magiclink";
  confirmationUrl: string;
  token?: string | null;
}): Promise<string> {
  const [{ supabaseAdmin }, React, { render }, inviteModule, magicLinkModule] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("react"),
    import("@react-email/components"),
    import("@/lib/email-templates/invite"),
    import("@/lib/email-templates/magic-link"),
  ]);

  const EmailTemplate =
    args.emailType === "invite" ? inviteModule.InviteEmail : magicLinkModule.MagicLinkEmail;
  const templateProps = {
    siteName: SITE_NAME,
    siteUrl: siteUrl(),
    confirmationUrl: args.confirmationUrl,
    token: args.token ?? undefined,
  };
  const element = React.createElement(EmailTemplate, templateProps);
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  const messageId = crypto.randomUUID();
  const subject =
    args.emailType === "invite"
      ? "Welcome to your Gator Law case portal"
      : "Your Gator Law portal sign-in link";

  await supabaseAdmin.from("email_send_log").insert({
    message_id: messageId,
    template_name: args.emailType,
    recipient_email: args.email,
    status: "pending",
    metadata: { source: "portal_reinvite" },
  });

  const { error } = await supabaseAdmin.rpc("enqueue_email", {
    queue_name: "auth_emails",
    payload: {
      message_id: messageId,
      to: args.email,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: "transactional",
      label: args.emailType,
      queued_at: new Date().toISOString(),
    },
  });

  if (error) {
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: args.emailType,
      recipient_email: args.email,
      status: "failed",
      error_message: `enqueue: ${error.message}`,
      metadata: { source: "portal_reinvite" },
    });
    throw new Error(`Failed to enqueue portal email: ${error.message}`);
  }

  return messageId;
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
}): Promise<{ userId: string; resent: boolean; messageId: string }> {
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
  let messageId: string | undefined;

  if (existing && existing.email.toLowerCase() === email) {
    // Refresh the link so the client can come back in. generateLink only creates
    // the link; it does not send the email, so we enqueue it ourselves.
    const link = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: existing.email,
      options: { redirectTo },
    });
    if (link.error) throw new Error(link.error.message);
    userId = existing.user_id;
    resent = true;
    const linkData = link.data as GeneratedLinkData | null;
    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) throw new Error("Portal sign-in link could not be generated.");
    messageId = await enqueuePortalAuthEmail({
      email: existing.email,
      emailType: "magiclink",
      confirmationUrl: actionLink,
      token: linkData?.properties?.email_otp,
    });
  } else {
    // First-time invite, or replacing a previous portal address for this contact.
    // generateLink creates the auth invite + link but, unlike inviteUserByEmail,
    // does not depend on the auth-email hook firing.
    const invite = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo },
    });
    if (invite.error) {
      const msg = invite.error.message || "";
      if (/already|registered|exists/i.test(msg)) {
        const link = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo },
        });
        if (link.error) throw new Error(link.error.message);
        const linkData = link.data as GeneratedLinkData | null;
        userId = (linkData?.user as AdminUser | null | undefined)?.id;
        resent = true;
        const actionLink = linkData?.properties?.action_link;
        if (!actionLink) throw new Error("Portal sign-in link could not be generated.");
        messageId = await enqueuePortalAuthEmail({
          email,
          emailType: "magiclink",
          confirmationUrl: actionLink,
          token: linkData?.properties?.email_otp,
        });
      } else {
        throw new Error(msg || "Failed to send invite.");
      }
    } else {
      const inviteData = invite.data as GeneratedLinkData | null;
      userId = (inviteData?.user as AdminUser | null | undefined)?.id;
      const actionLink = inviteData?.properties?.action_link;
      if (!actionLink) throw new Error("Portal invite link could not be generated.");
      messageId = await enqueuePortalAuthEmail({
        email,
        emailType: "invite",
        confirmationUrl: actionLink,
        token: inviteData?.properties?.email_otp,
      });
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
        { onConflict: existing ? "zoho_contact_id" : "user_id" },
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

  if (!messageId) throw new Error("Portal email was not queued.");
  return { userId: userId!, resent, messageId };
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
