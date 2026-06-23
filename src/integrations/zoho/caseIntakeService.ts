/**
 * caseIntakeService.ts — `onCaseOpened(caseId)`, the idempotent intake playbook.
 *
 * Runs whenever an SSDI case is created at "Retained" — from the retainer-signed
 * webhook AND from manual/seeded creation. Every step is gated by an idempotency
 * check so re-running is safe; failures inside a step are caught and logged to
 * `case_activity_log` rather than aborting the rest of the playbook.
 *
 * Service-role helper. Caller is responsible for authorization.
 */

import { SERVICE_ACTOR, type ZohoClient, type ZohoRecord } from "./zohoClient";
import { localToday } from "./deadlines";
import { HOOKS } from "./lifecycle";

const CASES = "SSDI_Cases";
const ENGAGEMENTS = "Engagements";
const CONTACTS = "Contacts";
const USERS_MODULE = "users"; // not used; kept for clarity

const iso = (d: Date) => d.toISOString().slice(0, 10);
const lookupId = (v: unknown): string | undefined =>
  typeof v === "string" ? v : (v as { id?: string })?.id;

/** Static defaults for intake automation toggles. Move to a firm_intake_settings
 *  row when the Settings UI lands. */
export const DEFAULT_INTAKE_CONFIG = {
  ssa1696: true,
  taskBundle: true,
  portalInvite: true,
  welcomeEmail: true,
  questionnaireEmail: true,
  docRequest: true,
  ssa1693: false,
  internalNotification: true,
} as const;

export type IntakeConfig = typeof DEFAULT_INTAKE_CONFIG;

interface PlaybookStepResult {
  step: string;
  status: "ok" | "skipped" | "error";
  detail?: string;
}

interface RunOpts {
  zoho: ZohoClient;
  caseId: string;
  actor?: string;
  config?: Partial<IntakeConfig>;
}

/**
 * Run the intake playbook for an SSDI case. Idempotent — re-runs are safe.
 * Returns the per-step result array for the activity log / UI.
 */
export async function onCaseOpened(opts: RunOpts): Promise<PlaybookStepResult[]> {
  const actor = opts.actor ?? SERVICE_ACTOR;
  const cfg: IntakeConfig = { ...DEFAULT_INTAKE_CONFIG, ...(opts.config ?? {}) };
  const api = opts.zoho.as(actor);
  const results: PlaybookStepResult[] = [];

  // Load case + engagement + client once.
  const caseRec = await api.getRecord<ZohoRecord>(CASES, opts.caseId, [
    "id", "Engagement", "Date_Opened", "Assigned_Case_Manager",
    "SSA1696_Status", "SSA827_Status", "SSA1693_Status",
    "Claim_Type", "Onset_Date", "Last_Worked_Date", "Primary_Impairment",
  ]);
  if (!caseRec) throw new Error(`SSDI case ${opts.caseId} not found`);
  const engagementId = lookupId(caseRec.Engagement);
  if (!engagementId) throw new Error(`Case ${opts.caseId} has no Engagement.`);

  const engagement = await api.getRecord<ZohoRecord>(ENGAGEMENTS, engagementId, [
    "Client", "Owner", "Name",
  ]);
  const clientId = lookupId(engagement?.Client);
  const client = clientId
    ? await api.getRecord<ZohoRecord>(CONTACTS, clientId, ["First_Name", "Last_Name", "Email"])
    : undefined;
  const clientEmail = (client?.Email as string | undefined)?.trim().toLowerCase() || undefined;
  const clientFirstName = (client?.First_Name as string | undefined) || undefined;
  const clientLastName = (client?.Last_Name as string | undefined) || undefined;
  const clientFullName = [clientFirstName, clientLastName].filter(Boolean).join(" ").trim() || undefined;

  const log = async (step: string, status: "ok" | "skipped" | "error", detail?: string) => {
    results.push({ step, status, detail });
    try {
      const { logCaseActivity } = await import("@/integrations/audit/log.server");
      await logCaseActivity({
        caseId: opts.caseId,
        engagementId,
        action: "case.intake.step",
        summary: `Intake · ${step} · ${status}${detail ? ` — ${detail}` : ""}`,
        metadata: { step, status, detail: detail ?? null },
      });
    } catch (e) {
      console.error("[onCaseOpened] activity log failed", { step, err: e });
    }
  };

  // ---- Step 1: SSA-1696 e-sign ----
  if (cfg.ssa1696) {
    try {
      if ((caseRec.SSA1696_Status as string) && caseRec.SSA1696_Status !== "Not sent") {
        await log("SSA-1696 e-sign", "skipped", `already ${caseRec.SSA1696_Status}`);
      } else {
        const { makeFormsService } = await import("./signClient.server");
        const forms = makeFormsService();
        await forms.sendForm(SERVICE_ACTOR, opts.caseId, "SSA-1696");
        await log("SSA-1696 e-sign", "ok", "sent for signature");
      }
    } catch (e) {
      await log("SSA-1696 e-sign", "error", e instanceof Error ? e.message : String(e));
    }
  }

  // ---- Step 2: SSA-827 prepare only ----
  // No send — surfaced via the Action Center's "needs attestation" flag.
  await log("SSA-827 prepare", "ok", "kept Not sent (attestation gated)");

  // ---- Step 3: Task bundle from HOOKS["Retained"].tasks ----
  if (cfg.taskBundle) {
    try {
      const tasks = HOOKS["Retained"]?.tasks ?? [];
      const dateOpened = (caseRec.Date_Opened as string | undefined) ?? iso(localToday());
      const ownerId = lookupId(caseRec.Assigned_Case_Manager);

      // Fetch existing task subjects to dedupe.
      const existing = await api.getRelated<ZohoRecord>(CASES, opts.caseId, "Tasks", ["Subject"]);
      const existingSubjects = new Set(
        existing.map((t) => String(t.Subject ?? "")).filter(Boolean),
      );

      const toCreate: ZohoRecord[] = [];
      for (const t of tasks) {
        if (existingSubjects.has(t.label)) continue;
        let dueDate: string | null = null;
        if (t.due.type === "fieldPlus") {
          const base = t.due.field === "Date_Opened" ? dateOpened : (caseRec[t.due.field] as string | undefined);
          if (base) {
            const d = new Date(base);
            d.setUTCDate(d.getUTCDate() + t.due.days);
            dueDate = iso(d);
          }
        }
        const task: ZohoRecord = {
          Subject: t.label,
          What_Id: { id: opts.caseId },
          $se_module: CASES,
          Status: "Not Started",
          Priority: "High",
        };
        if (dueDate) task.Due_Date = dueDate;
        if (ownerId) task.Owner = { id: ownerId };
        toCreate.push(task);
      }
      if (toCreate.length === 0) {
        await log("Task bundle", "skipped", `${tasks.length} task(s) already present`);
      } else {
        await api.createRecords("Tasks", toCreate);
        await log("Task bundle", "ok", `created ${toCreate.length} task(s)`);
      }
    } catch (e) {
      await log("Task bundle", "error", e instanceof Error ? e.message : String(e));
    }
  }

  // ---- Step 4: Auto-invite to portal (and fill case id) ----
  if (cfg.portalInvite) {
    try {
      if (!clientEmail) {
        await log("Portal invite", "skipped", "client has no email");
      } else {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: existingLink } = await supabaseAdmin
          .from("client_portal_links")
          .select("user_id, zoho_case_id")
          .eq("zoho_engagement_id", engagementId)
          .maybeSingle();
        if (existingLink) {
          if (!existingLink.zoho_case_id) {
            const { fillCaseIdOnLink } = await import("@/integrations/portal/autoInvite.server");
            await fillCaseIdOnLink({ engagementId, caseId: opts.caseId });
            await log("Portal invite", "ok", "linked existing portal to this case");
          } else {
            await log("Portal invite", "skipped", "portal already linked");
          }
        } else {
          const { autoInvitePortal, fillCaseIdOnLink } = await import("@/integrations/portal/autoInvite.server");
          // invitedByUserId is required by the helper; pass a zero-UUID for service runs.
          await autoInvitePortal({
            email: clientEmail,
            engagementId,
            invitedByUserId: "00000000-0000-0000-0000-000000000000",
          });
          await fillCaseIdOnLink({ engagementId, caseId: opts.caseId });
          await log("Portal invite", "ok", `invite sent to ${clientEmail}`);
        }
      }
    } catch (e) {
      await log("Portal invite", "error", e instanceof Error ? e.message : String(e));
    }
  }

  // ---- Step 5: Welcome-packet email ----
  if (cfg.welcomeEmail) {
    await sendTransactionalSafe({
      step: "Welcome email",
      log,
      recipientEmail: clientEmail,
      templateName: "ssdi-welcome-packet",
      idempotencyKey: `ssdi-welcome-${opts.caseId}`,
      templateData: {
        firstName: clientFirstName ?? null,
        attorneyName: null,
        attorneyEmail: null,
        portalUrl: `${siteUrl()}/portal`,
      },
    });
  }

  // ---- Step 6: Intake questionnaire email ----
  if (cfg.questionnaireEmail) {
    await sendTransactionalSafe({
      step: "Intake questionnaire email",
      log,
      recipientEmail: clientEmail,
      templateName: "ssdi-intake-questionnaire",
      idempotencyKey: `ssdi-intake-questionnaire-${opts.caseId}`,
      templateData: {
        firstName: clientFirstName ?? null,
        questionnaireUrl: `${siteUrl()}/portal/intake?case=${opts.caseId}`,
      },
    });
  }

  // ---- Step 7: Document request ----
  if (cfg.docRequest) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const label = "Standard SSDI intake documents";
      const { data: existingReq } = await supabaseAdmin
        .from("document_requests")
        .select("id")
        .eq("case_id", opts.caseId)
        .eq("label", label)
        .maybeSingle();
      if (existingReq) {
        await log("Document request", "skipped", "intake request already exists");
      } else {
        const { error } = await supabaseAdmin.from("document_requests").insert({
          case_id: opts.caseId,
          engagement_id: engagementId,
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

  // ---- Step 8: SSA-1693 (only when firm uses the 1693 fee vehicle) ----
  if (cfg.ssa1693) {
    try {
      if ((caseRec.SSA1693_Status as string) && caseRec.SSA1693_Status !== "Not sent") {
        await log("SSA-1693 e-sign", "skipped", `already ${caseRec.SSA1693_Status}`);
      } else {
        const { makeFormsService } = await import("./signClient.server");
        const forms = makeFormsService();
        await forms.sendForm(SERVICE_ACTOR, opts.caseId, "SSA-1693");
        await log("SSA-1693 e-sign", "ok", "sent for signature");
      }
    } catch (e) {
      await log("SSA-1693 e-sign", "error", e instanceof Error ? e.message : String(e));
    }
  }

  // ---- Step 9: Carry forward lead screener data ----
  // Lead → Contact link is one-way; reading it requires a lookup we don't have
  // wired here yet. Skipped (intentionally) — the lead screener already lives
  // on the Lead's Description and can be pulled later. Logged for visibility.
  await log("Carry-forward lead data", "skipped", "lead lookup not wired yet");

  // ---- Step 10: Internal notification (activity log entry) ----
  if (cfg.internalNotification) {
    try {
      const { logCaseActivity } = await import("@/integrations/audit/log.server");
      await logCaseActivity({
        caseId: opts.caseId,
        engagementId,
        action: "case.opened",
        summary: `New SSDI case opened${clientFullName ? `: ${clientFullName}` : ""}.`,
        metadata: { clientId: clientId ?? null, clientFullName: clientFullName ?? null },
      });
      await log("Internal notification", "ok");
    } catch (e) {
      await log("Internal notification", "error", e instanceof Error ? e.message : String(e));
    }
  }

  return results;
}

function siteUrl(): string {
  return (
    process.env.SITE_URL ||
    process.env.VITE_SITE_URL ||
    "https://gator-case-nexus.lovable.app"
  ).replace(/\/$/, "");
}

interface SendArgs {
  step: string;
  log: (step: string, status: "ok" | "skipped" | "error", detail?: string) => Promise<void>;
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

  // Idempotency: check the email_send_log for a previously-sent send.
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
