/**
 * conversionPlaybook.ts — `onConversion`, the idempotent onboarding playbook that
 * runs the moment a Lead is converted (Contact + Engagement exist; case may not).
 *
 * The portal is the onboarding surface: invite, welcome, intake questionnaire,
 * and an intake document request all happen here so the client can start work
 * immediately. SSDI-specific case kickoff (SSA-1696/827, task bundle) stays in
 * `caseIntakeService.onCaseOpened` and fires when the retainer is signed.
 *
 * Service-role helper. Caller is responsible for authorization.
 */

import { SERVICE_ACTOR, type ZohoClient, type ZohoRecord } from "./zohoClient";

const ENGAGEMENTS = "Engagements";
const CONTACTS = "Contacts";

const lookupId = (v: unknown): string | undefined =>
  typeof v === "string" ? v : (v as { id?: string })?.id;

export const DEFAULT_CONVERSION_CONFIG = {
  portalInvite: true,
  welcomeEmail: true,
  questionnaireEmail: true,
  docRequest: true,
} as const;

export type ConversionConfig = typeof DEFAULT_CONVERSION_CONFIG;

interface StepResult {
  step: string;
  status: "ok" | "skipped" | "error";
  detail?: string;
}

interface RunOpts {
  zoho: ZohoClient;
  /** Either the engagement id (preferred) or the contact id is required. */
  engagementId: string;
  contactId?: string;
  invitedByUserId?: string;
  actor?: string;
  config?: Partial<ConversionConfig>;
}

function siteUrl(): string {
  return (
    process.env.SITE_URL ||
    process.env.VITE_SITE_URL ||
    "https://gator-case-nexus.lovable.app"
  ).replace(/\/$/, "");
}

/**
 * Run the conversion playbook. Idempotent — every step checks for prior state
 * (existing portal row, existing send-log entry, existing doc request) before
 * acting. Failures inside a step are caught and logged; later steps continue.
 */
export async function onConversion(opts: RunOpts): Promise<StepResult[]> {
  const cfg: ConversionConfig = { ...DEFAULT_CONVERSION_CONFIG, ...(opts.config ?? {}) };
  const actor = opts.actor ?? SERVICE_ACTOR;
  const api = opts.zoho.as(actor);
  const results: StepResult[] = [];

  // Resolve engagement + contact + email.
  const engagement = await api.getRecord<ZohoRecord>(ENGAGEMENTS, opts.engagementId, [
    "Client", "Owner", "Name", "Engagement_Type",
  ]);
  if (!engagement) throw new Error(`Engagement ${opts.engagementId} not found`);
  const contactId = opts.contactId ?? lookupId(engagement.Client);
  if (!contactId) throw new Error(`Engagement ${opts.engagementId} has no Client.`);

  const contact = await api.getRecord<ZohoRecord>(CONTACTS, contactId, [
    "First_Name", "Last_Name", "Email",
  ]);
  const clientEmail = (contact?.Email as string | undefined)?.trim().toLowerCase() || undefined;
  const clientFirstName = (contact?.First_Name as string | undefined) || undefined;

  const log = async (step: string, status: StepResult["status"], detail?: string) => {
    results.push({ step, status, detail });
    try {
      const { logCaseActivity } = await import("@/integrations/audit/log.server");
      await logCaseActivity({
        caseId: opts.engagementId,
        engagementId: opts.engagementId,
        action: "conversion.step",
        summary: `Onboarding · ${step} · ${status}${detail ? ` — ${detail}` : ""}`,
        metadata: { step, status, detail: detail ?? null },
      });
    } catch (e) {
      console.error("[onConversion] activity log failed", { step, err: e });
    }
  };

  // ---- Portal invite ----
  if (cfg.portalInvite) {
    try {
      if (!clientEmail) {
        await log("Portal invite", "skipped", "client has no email");
      } else {
        const { autoInvitePortal } = await import("@/integrations/portal/autoInvite.server");
        const { resent } = await autoInvitePortal({
          email: clientEmail,
          contactId,
          invitedByUserId:
            opts.invitedByUserId ?? "00000000-0000-0000-0000-000000000000",
        });
        await log(
          "Portal invite",
          "ok",
          resent ? `re-sent sign-in link to ${clientEmail}` : `invite sent to ${clientEmail}`,
        );
      }
    } catch (e) {
      await log("Portal invite", "error", e instanceof Error ? e.message : String(e));
    }
  }

  // ---- Welcome email ----
  if (cfg.welcomeEmail) {
    await sendTransactionalSafe({
      step: "Welcome email",
      log,
      recipientEmail: clientEmail,
      templateName: "ssdi-welcome-packet",
      idempotencyKey: `welcome-${opts.engagementId}`,
      templateData: {
        firstName: clientFirstName ?? null,
        attorneyName: null,
        attorneyEmail: null,
        portalUrl: `${siteUrl()}/portal`,
      },
    });
  }

  // ---- Intake questionnaire email ----
  if (cfg.questionnaireEmail) {
    await sendTransactionalSafe({
      step: "Intake questionnaire email",
      log,
      recipientEmail: clientEmail,
      templateName: "ssdi-intake-questionnaire",
      idempotencyKey: `intake-questionnaire-${opts.engagementId}`,
      templateData: {
        firstName: clientFirstName ?? null,
        questionnaireUrl: `${siteUrl()}/portal/intake?engagement=${opts.engagementId}`,
      },
    });
  }

  // ---- Intake document request (engagement-scoped, no case required) ----
  if (cfg.docRequest) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const label = "Standard intake documents";
      const { data: existingReq } = await supabaseAdmin
        .from("document_requests")
        .select("id")
        .eq("engagement_id", opts.engagementId)
        .eq("label", label)
        .maybeSingle();
      if (existingReq) {
        await log("Document request", "skipped", "intake request already exists");
      } else {
        const { error } = await supabaseAdmin.from("document_requests").insert({
          engagement_id: opts.engagementId,
          label,
          instructions: [
            "Photo ID (driver's license, passport, or state ID).",
            "Recent medical records or visit summaries from your treating providers.",
            "Any letters or notices you've received from the Social Security Administration.",
            "Recent pay stubs or W-2s, if you've worked in the past 5 years.",
          ].join("\n\n"),
          status: "open",
        });
        if (error) throw new Error(error.message);
        await log("Document request", "ok", "created intake request");
      }
    } catch (e) {
      await log("Document request", "error", e instanceof Error ? e.message : String(e));
    }
  }

  return results;
}

interface SendArgs {
  step: string;
  log: (step: string, status: StepResult["status"], detail?: string) => Promise<void>;
  recipientEmail?: string;
  templateName: string;
  idempotencyKey: string;
  templateData: Record<string, unknown>;
}

async function sendTransactionalSafe(args: SendArgs): Promise<void> {
  if (!args.recipientEmail) {
    await args.log(args.step, "skipped", "client has no email");
    return;
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    await args.log(args.step, "error", "SUPABASE_SERVICE_ROLE_KEY missing");
    return;
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("email_send_log")
      .select("message_id, status")
      .eq("message_id", args.idempotencyKey)
      .eq("status", "sent")
      .maybeSingle();
    if (existing) {
      await args.log(args.step, "skipped", "already sent");
      return;
    }
  } catch {
    // best-effort; proceed to send
  }
  try {
    const url = `${siteUrl()}/lovable/email/transactional/send`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        templateName: args.templateName,
        recipientEmail: args.recipientEmail,
        idempotencyKey: args.idempotencyKey,
        templateData: args.templateData,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      await args.log(args.step, "error", `HTTP ${res.status}: ${text.slice(0, 200)}`);
      return;
    }
    await args.log(args.step, "ok", `sent to ${args.recipientEmail}`);
  } catch (e) {
    await args.log(args.step, "error", e instanceof Error ? e.message : String(e));
  }
}
