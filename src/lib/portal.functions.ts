/**
 * portal.functions.ts — Client-portal server functions.
 *
 * The portal is contact-keyed: one passwordless login → all of that client's
 * matters across practices. Adapters in `src/integrations/portal/` are the only
 * place client-facing data is shaped, enforcing the client-safe allowlist
 * (no fees, internal notes, or strategy can leak).
 *
 * Staff = signed-in user with an `@gatorlawpc.com` email (mirrors the gate in
 * src/routes/_authenticated/route.tsx). Clients = anyone else with a row in
 * `client_portal_contacts`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildPortalView,
  ssdiToPortalMatter,
  type PortalMatter,
  type PortalView,
} from "@/integrations/portal/portal";
import {
  fcraPortalAdapter,
  fdcpaPortalAdapter,
  tcpaPortalAdapter,
  classActionPortalAdapter,
} from "@/integrations/portal/adapters/stubs";

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
 * Staff-only. Sends a passwordless invite to a client and binds their auth
 * user to the Zoho Contact (so they can later be added to another matter
 * without a second invite). Safe to re-invoke — resends the magic link.
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

    // Resolve the Zoho contact id from the engagement/case the caller gave us.
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const api = makeZohoClient().as(context.userId);

    let engagementId = data.engagementId;
    if (!engagementId && data.caseId) {
      const c = await api.getRecord<{ Engagement?: { id?: string } | string }>(
        "SSDI_Cases",
        data.caseId,
        ["Engagement"],
      );
      const e = c?.Engagement;
      engagementId = typeof e === "string" ? e : e?.id;
    }
    if (!engagementId) throw new Error("Could not resolve engagement for invite.");

    const engagement = await api.getRecord<{ Client?: { id?: string } | string }>(
      "Engagements",
      engagementId,
      ["Client"],
    );
    const cl = engagement?.Client;
    const contactId = typeof cl === "string" ? cl : cl?.id;
    if (!contactId) throw new Error("Engagement has no Client (Contact) to invite.");

    const { autoInvitePortal } = await import("@/integrations/portal/autoInvite.server");
    const { userId, resent } = await autoInvitePortal({
      email: data.email,
      contactId,
      engagementId,
      invitedByUserId: context.userId,
    });

    const { logCaseActivity } = await import("@/integrations/audit/log.server");
    await logCaseActivity({
      caseId: data.caseId ?? engagementId,
      engagementId,
      actorUserId: context.userId,
      actorEmail: staffEmail,
      action: "portal.invite",
      summary: resent
        ? `Re-sent portal sign-in link to ${data.email}.`
        : `Sent portal invite to ${data.email}.`,
      metadata: { email: data.email, contactId, engagementId },
    });

    return { ok: true, userId, emailSent: true, resent };
  });

/** Staff-only. Shows which client is enrolled on a case (for the case page). */
export const getPortalLinkForCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ caseId: z.string().regex(ID_RE) }).parse(data))
  .handler(async ({ data, context }) => {
    const staffEmail = (context.claims as { email?: string }).email;
    ensureStaff(staffEmail);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("client_portal_links")
      .select("email, created_at")
      .eq("zoho_case_id", data.caseId)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { link: row };
  });

// ---------- Client-facing: assemble the multi-matter PortalView ----------

interface EngagementRow {
  id: string;
  Name?: string;
  Engagement_Type?: string;
  Engagement_Status?: string;
  Retainer_Status?: string;
  Assigned_Attorney?: { id?: string; name?: string } | string;
  Modified_Time?: string;
}

interface SsdiCaseRow {
  id: string;
  Current_Stage?: string;
  ALJ_Hearing_Scheduled_Date?: string;
  Assigned_Attorney?: { id?: string; name?: string } | string;
}

function attorneyName(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "name" in v) {
    const n = (v as { name?: string }).name;
    return typeof n === "string" ? n : undefined;
  }
  return undefined;
}

/**
 * Client-facing. Returns the signed-in client's full PortalView — every matter
 * across every practice, shaped by per-practice adapters. Raw Zoho records
 * never cross this boundary; only the allowlisted `PortalMatter` fields do.
 */
export const getMyPortalView = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<
    | { linked: false }
    | { linked: true; email: string; view: PortalView }
  > => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Resolve user → contact (new table) with legacy fallback for clients
    //    who were invited before the contact-keyed table existed.
    const { data: contactLink } = await supabaseAdmin
      .from("client_portal_contacts")
      .select("zoho_contact_id, email, intake_state")
      .eq("user_id", context.userId)
      .maybeSingle();

    let zohoContactId: string | null = contactLink?.zoho_contact_id ?? null;
    let email: string = contactLink?.email ?? "";
    const intakeState =
      (contactLink?.intake_state as Record<string, Record<string, string | null>>) ?? {};

    if (!zohoContactId) {
      // Legacy fallback: look up via the case-keyed table and resolve the contact in Zoho.
      const { data: legacy } = await supabaseAdmin
        .from("client_portal_links")
        .select("zoho_case_id, zoho_engagement_id, email")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!legacy) return { linked: false };
      email = legacy.email;
      const { makeZohoClient } = await import("@/integrations/zoho/client.server");
      const zoho = makeZohoClient().service();
      const engId =
        legacy.zoho_engagement_id ??
        (legacy.zoho_case_id
          ? ((await zoho.getRecord<{ Engagement?: { id?: string } | string }>(
              "SSDI_Cases",
              legacy.zoho_case_id,
              ["Engagement"],
            )) ?? {}).Engagement
          : null);
      const engIdStr =
        typeof engId === "string" ? engId : (engId as { id?: string } | undefined)?.id;
      if (engIdStr) {
        const eng = await zoho.getRecord<{ Client?: { id?: string } | string }>(
          "Engagements",
          engIdStr,
          ["Client"],
        );
        const c = eng?.Client;
        zohoContactId = (typeof c === "string" ? c : c?.id) ?? null;
      }
      if (!zohoContactId) return { linked: false };
    }

    // 2) List the client's engagements via COQL (contact-scoped).
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const zoho = makeZohoClient().service();
    const engagements = await zoho
      .coql<EngagementRow>(
        `select id, Name, Engagement_Type, Engagement_Status, Retainer_Status, Assigned_Attorney, Modified_Time from Engagements where Client.id = '${zohoContactId}' order by Modified_Time desc limit 50`,
      )
      .catch((err) => {
        console.error("[getMyPortalView] engagements COQL failed", err);
        return [] as EngagementRow[];
      });

    // 3) For each engagement, shape via the per-practice adapter (allowlist).
    const matters: PortalMatter[] = [];
    for (const eng of engagements) {
      const practice = (eng.Engagement_Type ?? "").toString();
      const attorney = attorneyName(eng.Assigned_Attorney);

      if (practice === "SSDI") {
        // Look up the SSDI case (if opened) for stage + hearing date.
        let caseRow: SsdiCaseRow | null = null;
        const cases = await zoho
          .coql<SsdiCaseRow>(
            `select id, Current_Stage, ALJ_Hearing_Scheduled_Date, Assigned_Attorney from SSDI_Cases where Engagement.id = '${eng.id}' limit 1`,
          )
          .catch(() => [] as SsdiCaseRow[]);
        caseRow = cases[0] ?? null;

        // Open document requests for this engagement OR its case (allowlisted projection).
        const docs = await supabaseAdmin
          .from("document_requests")
          .select("id, label, status, case_id, engagement_id")
          .or(
            `engagement_id.eq.${eng.id}${caseRow ? `,case_id.eq.${caseRow.id}` : ""}`,
          )
          .eq("status", "open");
        const openDocRequests =
          docs.data?.map((d) => ({ id: d.id as string, label: d.label as string })) ?? [];

        const retainerSigned = (eng.Retainer_Status ?? "").toLowerCase() === "signed";
        const questionnaireOutstanding = !intakeState[eng.id]?.questionnaire_completed_at;

        matters.push(
          ssdiToPortalMatter({
            engagementId: eng.id,
            stage: caseRow?.Current_Stage ?? "Retained",
            retainerSigned,
            hearingDate: caseRow?.ALJ_Hearing_Scheduled_Date ?? undefined,
            attorney: attorneyName(caseRow?.Assigned_Attorney) ?? attorney,
            openDocRequests,
            questionnaireOutstanding,
            updatedAt: eng.Modified_Time,
          }),
        );
        continue;
      }

      const stubInput = {
        engagementId: eng.id,
        attorney,
        updatedAt: eng.Modified_Time,
      };
      switch (practice) {
        case "FCRA":
          matters.push(fcraPortalAdapter.toMatter(stubInput));
          break;
        case "FDCPA":
          matters.push(fdcpaPortalAdapter.toMatter(stubInput));
          break;
        case "TCPA":
          matters.push(tcpaPortalAdapter.toMatter(stubInput));
          break;
        case "Class Action":
        case "ClassAction":
          matters.push(classActionPortalAdapter.toMatter(stubInput));
          break;
        default:
          // Unknown practice — surface the engagement title with a generic status.
          matters.push({
            id: eng.id,
            practice: "SSDI", // typed; will be overridden once an adapter exists
            title: eng.Name ?? "Your matter",
            statusLabel: "In progress",
            actionsNeeded: [],
            keyDates: [],
            attorney,
            updatedAt: eng.Modified_Time,
          });
      }
    }

    return { linked: true, email, view: buildPortalView(matters) };
  });
