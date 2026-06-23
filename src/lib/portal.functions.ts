/**
 * portal.functions.ts — Client-portal server functions.
 *
 * The client portal lets a claimant sign in (via Supabase magic link) and see
 * their own SSDI case status, current stage, deadline, and a few other read-only
 * facts. The link between an `auth.users` row and a Zoho case lives in the
 * `client_portal_links` table; rows are inserted by firm staff via `inviteClientToPortal`.
 *
 * Staff = signed-in user with an `@gatorlawpc.com` email (mirrors the gate in
 * src/routes/_authenticated/route.tsx). Clients = anyone else with a link row.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FIRM_DOMAIN = "gatorlawpc.com";

function ensureStaff(email: string | undefined): asserts email is string {
  if (!email || !email.toLowerCase().endsWith(`@${FIRM_DOMAIN}`)) {
    throw new Error("Forbidden: firm staff only.");
  }
}

const ID_RE = /^[A-Za-z0-9_]+$/;

const inviteInput = z
  .object({
    email: z.string().trim().toLowerCase().email().max(255),
    caseId: z.string().regex(ID_RE).optional(),
    engagementId: z.string().regex(ID_RE).optional(),
  })
  .refine((v) => !!v.caseId || !!v.engagementId, {
    message: "Either caseId or engagementId is required.",
  });


/**
 * Staff-only. Sends a magic-link invite to the client and links their
 * auth.users row to the given SSDI case. Safe to re-invoke (re-sends the link).
 */
export const inviteClientToPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => inviteInput.parse(data))
  .handler(async ({ data, context }) => {
    const staffEmail = (context.claims as { email?: string }).email;
    ensureStaff(staffEmail);
    if (data.email.toLowerCase().endsWith(`@${FIRM_DOMAIN}`)) {
      throw new Error("Refuse to enroll a firm-domain email as a client.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const siteUrl =
      process.env.SITE_URL ??
      process.env.VITE_SITE_URL ??
      "https://gator-case-nexus.lovable.app";
    const redirectTo = `${siteUrl.replace(/\/$/, "")}/portal`;

    // Issue a magic-link invite. If the user already exists, generateLink with type
    // 'magiclink' just sends a fresh sign-in link instead of erroring.
    type AdminUser = { id: string; email?: string | null };
    let userId: string | undefined;
    const invite = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      redirectTo,
    });
    if (invite.error) {
      const msg = invite.error.message || "";
      // Already-registered user: send a magic link instead.
      if (/already|registered|exists/i.test(msg)) {
        const link = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: data.email,
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
          email: data.email,
          zoho_case_id: data.caseId ?? null,
          zoho_engagement_id: data.engagementId ?? null,
          invited_by: context.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (upsertError) throw new Error(upsertError.message);

    const { logCaseActivity } = await import("@/integrations/audit/log.server");
    await logCaseActivity({
      caseId: data.caseId ?? data.engagementId ?? "unknown",
      engagementId: data.engagementId ?? null,
      actorUserId: context.userId,
      actorEmail: staffEmail,
      action: "portal.invite",
      summary: `Sent portal invite to ${data.email}.`,
      metadata: { email: data.email, caseId: data.caseId ?? null },
    });

    return { ok: true, userId, emailSent: true };
  });


/**
 * Staff-only. Lists the portal link for a given case (so the case page can
 * show "Invited: client@example.com").
 */
export const getPortalLinkForCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ caseId: z.string().regex(ID_RE) }).parse(data))
  .handler(async ({ data, context }) => {
    const staffEmail = (context.claims as { email?: string }).email;
    ensureStaff(staffEmail);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("client_portal_links")
      .select("email, created_at")
      .eq("zoho_case_id", data.caseId)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { link: rows };
  });

/**
 * Client-facing. Returns the read-only portal view for the signed-in user.
 * Uses the SERVICE Zoho client (no per-client Zoho grant required).
 */
export const getMyClientPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link, error } = await supabaseAdmin
      .from("client_portal_links")
      .select("zoho_case_id, zoho_engagement_id, email")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!link) return { linked: false as const };

    // Invited but the SSDI case hasn't been opened yet (retainer not signed).
    if (!link.zoho_case_id) {
      return {
        linked: true as const,
        pending: true as const,
        email: link.email,
        caseId: null,
        case: null,
      };
    }

    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const zoho = makeZohoClient().service();
    const record = (await zoho.getRecord("SSDI_Cases", link.zoho_case_id, [
      "Case_Number",
      "Current_Stage",
      "Sub_Status",
      "Date_Opened",
      "Deadline_Date",
      "Days_To_Deadline",
      "ALJ_Hearing_Scheduled_Date",
      "Hearing_Type",
      "Hearing_Office_ODAR",
      "ALJ_Name",
      "Notice_of_Award_Date",
      "Assigned_Attorney",
    ])) as Record<string, unknown> | null;

    if (!record)
      return {
        linked: true as const,
        pending: false as const,
        email: link.email,
        caseId: link.zoho_case_id,
        case: null,
      };

    type Lookup = { name?: string };
    const attorney = record.Assigned_Attorney as Lookup | string | null | undefined;
    const attorneyName =
      typeof attorney === "object" && attorney
        ? attorney.name ?? null
        : typeof attorney === "string"
        ? attorney
        : null;

    return {
      linked: true as const,
      pending: false as const,
      email: link.email,
      caseId: link.zoho_case_id,
      case: {
        caseNumber: (record.Case_Number as string | null) ?? null,
        currentStage: (record.Current_Stage as string | null) ?? null,
        subStatus: (record.Sub_Status as string | null) ?? null,
        dateOpened: (record.Date_Opened as string | null) ?? null,
        deadlineDate: (record.Deadline_Date as string | null) ?? null,
        daysToDeadline:
          typeof record.Days_To_Deadline === "number" ? record.Days_To_Deadline : null,
        hearingDate: (record.ALJ_Hearing_Scheduled_Date as string | null) ?? null,
        hearingType: (record.Hearing_Type as string | null) ?? null,
        hearingOffice: (record.Hearing_Office_ODAR as string | null) ?? null,
        aljName: (record.ALJ_Name as string | null) ?? null,
        noticeOfAwardDate: (record.Notice_of_Award_Date as string | null) ?? null,
        attorneyName,
      },
    };
  });

