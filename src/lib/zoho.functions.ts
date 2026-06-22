/**
 * zoho.functions.ts — Server functions the UI calls. Per-user attribution.
 *
 * Every fn is wrapped in `requireSupabaseAuth`, resolves the user id from context,
 * then talks to Zoho AS that user via `makeZohoClient().as(userId)`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildQuery, type QueryName } from "./zoho-queries";

/** Recursive JSON-safe type. Server fns require the return value to be serializable. */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];
type ZohoRow = { [key: string]: Json };

/** Force a Zoho payload through JSON to guarantee it matches the Json shape. */
function toJson<T extends Json>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Pull the actor's email out of the validated Supabase claims. */
function actorEmail(claims: unknown): string | null {
  if (claims && typeof claims === "object" && "email" in claims) {
    const e = (claims as { email?: unknown }).email;
    return typeof e === "string" ? e : null;
  }
  return null;
}


const queryInput = z.object({
  name: z.enum([
    "openCases",
    "myOpenCases",
    "deadlinesAtRisk",
    "deadlinesAll",
    "myDeadlines",
    "upcomingHearings",
    "releasesExpiringSoon",
    "releasesAll",
    "pipelineByStage",
    "pipelineByPractice",
    "costsByEngagement",
    "casesByEngagement",
    "engagementById",
    "allEngagements",
    "engagementsByType",
    "myEngagements",
    "allContacts",
    "engagementsByContact",
    "allLeads",
    "allReferrals",
    "ssdiCaseSearch",
    "contactSearch",
    "contactFirstNameSearch",
    "contactEmailSearch",
    "contactPhoneSearch",
    "leadSearch",
    "leadFirstNameSearch",
    "leadEmailSearch",
    "leadCompanySearch",
    "engagementSearch",
  ]),
  params: z.record(z.string(), z.unknown()).optional(),
});



export const getConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { hasZohoConnection } = await import("@/integrations/zoho/tokenStore.server");
    const connected = await hasZohoConnection(context.userId);
    return { connected };
  });

export const getAuthorizeUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const { signState } = await import("@/integrations/zoho/state.server");
    const url = makeZohoClient().authorizeUrl(signState(context.userId));
    return { url };
  });

export const zohoQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => queryInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const client = makeZohoClient().as(context.userId);
    // "mine" queries filter on a Zoho user id (not the Supabase user id).
    // Resolve it only when needed.
    const needsZohoUser =
      data.name === "myOpenCases" ||
      data.name === "myEngagements" ||
      data.name === "myDeadlines";
    const zohoUserId = needsZohoUser ? await client.currentUserId() : undefined;
    if (needsZohoUser && !zohoUserId) {
      return { rows: [] as ZohoRow[] };
    }
    const params = { userId: zohoUserId, ...(data.params ?? {}) };
    const q = buildQuery(data.name as QueryName, params);
    const rows = await client.coql(q);
    return { rows: toJson<ZohoRow[]>(rows) };

  });


const caseIdInput = z.object({ caseId: z.string().regex(/^[A-Za-z0-9_]+$/) });

export const getCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => caseIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const record = await makeZohoClient().as(context.userId).getRecord("SSDI_Cases", data.caseId);
    return { record: record ? toJson<ZohoRow>(record) : null };

  });

const engagementIdInput = z.object({ engagementId: z.string().regex(/^[A-Za-z0-9_]+$/) });

export const getEngagement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => engagementIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const record = await makeZohoClient().as(context.userId).getRecord("Engagements", data.engagementId);
    return { record: record ? toJson<ZohoRow>(record) : null };
  });

const contactIdInput = z.object({ contactId: z.string().regex(/^[A-Za-z0-9_]+$/) });

export const getContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => contactIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const record = await makeZohoClient()
      .as(context.userId)
      .getRecord("Contacts", data.contactId, [
        "First_Name", "Last_Name", "Email", "Phone", "Mobile", "Home_Phone",
        "Contact_Type", "Lead_Source", "DOB",
        "Mailing_Street", "Mailing_City", "Mailing_State", "Mailing_Zip",
        "Owner", "Created_Time",
      ]);
    return { record: record ? toJson<ZohoRow>(record) : null };
  });

const leadIdInput = z.object({ leadId: z.string().regex(/^[A-Za-z0-9_]+$/) });

export const getLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => leadIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const record = await makeZohoClient()
      .as(context.userId)
      .getRecord("Leads", data.leadId, [
        "First_Name", "Last_Name", "Email", "Phone", "Mobile", "Company",
        "Lead_Source", "Lead_Status", "Practice_Area", "Description",
        "Owner", "Created_Time", "Converted_Contact",
        // Screener inputs
        "Working_Above_SGA", "Monthly_Earnings", "Is_Blind", "Receiving_Treatment",
        "Meets_12mo_Duration", "Claim_Type", "Date_Last_Insured", "Already_Represented",
        "Date_of_Birth", "Current_Level", "Appeal_Deadline_Date", "Primary_Impairment",
        // Screener outputs
        "Lead_Tier", "Lead_Score", "Screener_Knockouts", "Is_Urgent",
        // SMS consent (TCPA)
        "SMS_Consent_At", "SMS_Consent_Text", "SMS_Consent_Source",
      ]);
    return { record: record ? toJson<ZohoRow>(record) : null };
  });

const leadStatusInput = z.object({
  leadId: z.string().regex(/^[A-Za-z0-9_]+$/),
  status: z.enum(["New", "Qualified", "Disqualified"]),
});

export const updateLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => leadStatusInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    await makeZohoClient().as(context.userId).updateRecords("Leads", [
      { id: data.leadId, Lead_Status: data.status },
    ]);
    return { ok: true };
  });

const screenerInput = z.object({
  leadId: z.string().regex(/^[A-Za-z0-9_]+$/),
  input: z.object({
    workingAboveSGA: z.boolean().optional(),
    monthlyEarnings: z.number().nonnegative().optional(),
    isBlind: z.boolean().optional(),
    receivingTreatment: z.boolean().optional(),
    meetsTwelveMonthDuration: z.boolean().optional(),
    claimType: z.enum(["DIB", "SSI", "Concurrent", "Unknown"]).optional(),
    dateLastInsured: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    alreadyRepresented: z.boolean().optional(),
    age: z.number().int().min(0).max(120).optional(),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    currentLevel: z.enum([
      "No application yet", "Initial pending", "Initial denied",
      "Recon denied", "ALJ denied", "Other",
    ]).optional(),
    appealDeadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    primaryImpairment: z.string().trim().max(500).optional().or(z.literal("")),
  }),
  smsConsent: z.object({
    granted: z.boolean(),
    text: z.string().trim().max(2000).optional(),
    source: z.string().trim().max(100).optional(),
  }).optional(),
});

export const saveLeadScreener = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => screenerInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const { screenLead } = await import("@/integrations/zoho/leadScreening");

    const i = data.input;
    let age = i.age;
    if (age === undefined && i.dateOfBirth) {
      const dob = new Date(i.dateOfBirth + "T00:00:00Z");
      const now = new Date();
      age = now.getUTCFullYear() - dob.getUTCFullYear() -
        (now < new Date(Date.UTC(now.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate())) ? 1 : 0);
    }

    const result = screenLead({
      workingAboveSGA: i.workingAboveSGA,
      monthlyEarnings: i.monthlyEarnings,
      isBlind: i.isBlind,
      receivingTreatment: i.receivingTreatment,
      meetsTwelveMonthDuration: i.meetsTwelveMonthDuration,
      claimType: i.claimType,
      dateLastInsured: i.dateLastInsured || undefined,
      alreadyRepresented: i.alreadyRepresented,
      age,
      currentLevel: i.currentLevel,
      appealDeadlineDate: i.appealDeadlineDate || undefined,
    });

    const payload: Record<string, unknown> = {
      id: data.leadId,
      Working_Above_SGA: i.workingAboveSGA ?? null,
      Monthly_Earnings: i.monthlyEarnings ?? null,
      Is_Blind: i.isBlind ?? null,
      Receiving_Treatment: i.receivingTreatment ?? null,
      Meets_12mo_Duration: i.meetsTwelveMonthDuration ?? null,
      Claim_Type: i.claimType ?? null,
      Date_Last_Insured: i.dateLastInsured || null,
      Already_Represented: i.alreadyRepresented ?? null,
      Date_of_Birth: i.dateOfBirth || null,
      Current_Level: i.currentLevel ?? null,
      Appeal_Deadline_Date: i.appealDeadlineDate || null,
      Primary_Impairment: i.primaryImpairment || null,
      Lead_Tier: result.tier,
      Lead_Score: result.score,
      Screener_Knockouts: result.knockouts.map((k) => `[${k.severity}] ${k.label}`).join("\n") || null,
      Is_Urgent: result.urgent,
    };
    if (data.smsConsent?.granted) {
      payload.SMS_Consent_At = new Date().toISOString();
      payload.SMS_Consent_Text = data.smsConsent.text ?? null;
      payload.SMS_Consent_Source = data.smsConsent.source ?? "app:screener";
    }

    await makeZohoClient().as(context.userId).updateRecords("Leads", [payload]);
    return { result: toJson<Json>(result) };
  });

const createLeadInput = z.object({
  First_Name: z.string().trim().max(100).optional(),
  Last_Name: z.string().trim().min(1, "Last name is required").max(100),
  Email: z.string().trim().email().max(255).optional().or(z.literal("")),
  Phone: z.string().trim().max(40).optional().or(z.literal("")),
  Mobile: z.string().trim().max(40).optional().or(z.literal("")),
  Lead_Source: z.string().trim().max(100).optional().or(z.literal("")),
  Practice_Area: z.enum(["SSDI", "FCRA", "FDCPA", "TCPA", "Class Action"]).optional(),
  Description: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const createLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => createLeadInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const payload: Record<string, unknown> = { Lead_Status: "New" };
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined && v !== "") payload[k] = v;
    }
    const res = await makeZohoClient()
      .as(context.userId)
      .createRecords("Leads", [payload]);
    const first = (res?.[0] ?? {}) as { details?: { id?: string }; code?: string; message?: string };
    if (first.code && first.code !== "SUCCESS") {
      throw new Error(first.message || "Failed to create lead");
    }
    const id = first.details?.id;
    if (!id) throw new Error("Lead created but no id returned");
    return { id };
  });

const convertLeadInput = z.object({
  leadId: z.string().regex(/^[A-Za-z0-9_]+$/),
  override: z.object({ reason: z.string().trim().min(5).max(500) }).optional(),
});

export const convertLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => convertLeadInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const { createIntakeService } = await import("@/integrations/zoho/intakeService");
    const svc = createIntakeService({ zoho: makeZohoClient() });
    const result = await svc.convertLead(context.userId, data.leadId, { override: data.override });
    if (data.override) {
      const { logCaseActivity } = await import("@/integrations/audit/log.server");
      await logCaseActivity({
        caseId: result.engagementId,
        actorUserId: context.userId,
        actorEmail: actorEmail(context.claims),
        action: "lead.convert.override",
        summary: `Converted a Decline-tier lead with override: ${data.override.reason}`,
        metadata: { leadId: data.leadId, reason: data.override.reason },
      });
    }
    return toJson<{
      clientId: string; engagementId: string; leadId: string;
      conflict: { status: "Cleared" | "Conflict found"; matches: ZohoRow[] };
      override: { reason: string } | null;
    }>(result);
  });


const advanceInput = z.object({
  caseId: z.string().regex(/^[A-Za-z0-9_]+$/),
  toStage: z.string(),
  fields: z.record(z.string(), z.unknown()).optional(),
});

export const caseAdvance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => advanceInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const { createCaseService } = await import("@/integrations/zoho/caseService");
    const { logCaseActivity } = await import("@/integrations/audit/log.server");
    const svc = createCaseService({ zoho: makeZohoClient() });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await svc.advanceStage(context.userId, data.caseId, data.toStage as any, {
      fields: data.fields,
    });
    await logCaseActivity({
      caseId: data.caseId,
      actorUserId: context.userId,
      actorEmail: actorEmail(context.claims),
      action: "stage.advance",
      summary: `Advanced to "${data.toStage}"${result.deadline ? ` — deadline ${result.deadline}` : ""}.`,
      metadata: { toStage: data.toStage, deadline: result.deadline ?? null, fields: data.fields ?? {} },
    });
    // Fire-and-forget calendar sync. Never block stage advance on calendar errors.
    const { syncCaseCalendarSafe } = await import("@/integrations/zoho/caseCalendarSync");
    await syncCaseCalendarSafe(data.caseId);
    // Fire-and-forget client notify (email-only). Never block on messaging errors.
    const { notifySafe } = await import("@/integrations/messaging/notifyService.server");
    await notifySafe({ caseId: data.caseId, trigger: { kind: "stage", stage: data.toStage as never } });
    return result;
  });

export const caseRecomputeDeadline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => caseIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const { createCaseService } = await import("@/integrations/zoho/caseService");
    const svc = createCaseService({ zoho: makeZohoClient() });
    return await svc.recomputeDeadline(context.userId, data.caseId);
  });

const updateCaseDatesInput = z.object({
  caseId: z.string().regex(/^[A-Za-z0-9_]+$/),
  Notice_Date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  Documented_Receipt_Date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

/**
 * Update one or both deadline-driving dates on a case, then recompute the deadline.
 * Pass `null` for either field to clear it.
 */
export const updateCaseDates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => updateCaseDatesInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const { createCaseService } = await import("@/integrations/zoho/caseService");
    const { logCaseActivity } = await import("@/integrations/audit/log.server");
    const client = makeZohoClient();
    const payload: Record<string, unknown> = { id: data.caseId };
    if (data.Notice_Date !== undefined) payload.Notice_Date = data.Notice_Date;
    if (data.Documented_Receipt_Date !== undefined) payload.Documented_Receipt_Date = data.Documented_Receipt_Date;
    if (Object.keys(payload).length === 1) return { ok: true, changed: false };
    await client.as(context.userId).updateRecords("SSDI_Cases", [payload]);
    const svc = createCaseService({ zoho: client });
    const recomputed = await svc.recomputeDeadline(context.userId, data.caseId);
    const changed: string[] = [];
    if (data.Notice_Date !== undefined) changed.push(`Notice date → ${data.Notice_Date ?? "cleared"}`);
    if (data.Documented_Receipt_Date !== undefined)
      changed.push(`Documented receipt → ${data.Documented_Receipt_Date ?? "cleared"}`);
    await logCaseActivity({
      caseId: data.caseId,
      actorUserId: context.userId,
      actorEmail: actorEmail(context.claims),
      action: "case.dates.update",
      summary: changed.join("; "),
      metadata: {
        Notice_Date: data.Notice_Date,
        Documented_Receipt_Date: data.Documented_Receipt_Date,
        recomputedDeadline: recomputed,
      },
    });
    const { syncCaseCalendarSafe } = await import("@/integrations/zoho/caseCalendarSync");
    await syncCaseCalendarSafe(data.caseId);
    return { ok: true, changed: true, recomputed };
  });

/**
 * Manual "Resync" button on the case page. Returns the create/update/delete counts.
 */
export const resyncCaseCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => caseIdInput.parse(data))
  .handler(async ({ data }) => {
    const { syncCaseCalendar } = await import("@/integrations/zoho/caseCalendarSync");
    return await syncCaseCalendar(data.caseId);
  });

/**
 * Read-only: which calendar event keys ("deadline:<id>" / "hearing:<id>") this case
 * currently has on the firm calendar. Used to render the "On calendar ✓" pill.
 */
export const getCaseCalendarStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => caseIdInput.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("calendar_event_links")
      .select("key, google_event_id, updated_at")
      .eq("case_id", data.caseId);
    if (error) throw new Error(error.message);
    return {
      keys: (rows ?? []).map((r) => r.key as string),
      calendarConfigured: Boolean(process.env.GOOGLE_SSDI_CALENDAR_ID),
    };
  });

const taskIdInput = z.object({
  taskId: z.string().regex(/^[A-Za-z0-9_]+$/),
  caseId: z.string().regex(/^[A-Za-z0-9_]+$/).optional(),
});

export const completeTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => taskIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const { logCaseActivity } = await import("@/integrations/audit/log.server");
    await makeZohoClient().as(context.userId).updateRecords("Tasks", [
      { id: data.taskId, Status: "Completed" },
    ]);
    if (data.caseId) {
      await logCaseActivity({
        caseId: data.caseId,
        actorUserId: context.userId,
        actorEmail: actorEmail(context.claims),
        action: "task.complete",
        summary: "Completed a task.",
        metadata: { taskId: data.taskId },
      });
    }
    return { ok: true };
  });

export const reopenTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => taskIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const { logCaseActivity } = await import("@/integrations/audit/log.server");
    await makeZohoClient().as(context.userId).updateRecords("Tasks", [
      { id: data.taskId, Status: "Not Started" },
    ]);
    if (data.caseId) {
      await logCaseActivity({
        caseId: data.caseId,
        actorUserId: context.userId,
        actorEmail: actorEmail(context.claims),
        action: "task.reopen",
        summary: "Re-opened a task.",
        metadata: { taskId: data.taskId },
      });
    }
    return { ok: true };
  });

const reassignTaskInput = z.object({
  taskId: z.string().regex(/^[A-Za-z0-9_]+$/),
  ownerId: z.string().regex(/^[A-Za-z0-9_]+$/),
  caseId: z.string().regex(/^[A-Za-z0-9_]+$/).optional(),
  ownerName: z.string().trim().max(120).optional(),
});

export const reassignTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => reassignTaskInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const { logCaseActivity } = await import("@/integrations/audit/log.server");
    await makeZohoClient().as(context.userId).updateRecords("Tasks", [
      { id: data.taskId, Owner: { id: data.ownerId } },
    ]);
    if (data.caseId) {
      await logCaseActivity({
        caseId: data.caseId,
        actorUserId: context.userId,
        actorEmail: actorEmail(context.claims),
        action: "task.reassign",
        summary: data.ownerName ? `Reassigned task to ${data.ownerName}.` : "Reassigned a task.",
        metadata: { taskId: data.taskId, ownerId: data.ownerId },
      });
    }
    return { ok: true };
  });

const createCaseTaskInput = z.object({
  caseId: z.string().regex(/^[A-Za-z0-9_]+$/),
  subject: z.string().trim().min(1).max(255),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.enum(["Low", "Normal", "High", "Highest"]).optional(),
  ownerId: z.string().regex(/^[A-Za-z0-9_]+$/).optional(),
  description: z.string().trim().max(4000).optional(),
});

export const createCaseTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => createCaseTaskInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const { logCaseActivity } = await import("@/integrations/audit/log.server");
    const payload: Record<string, unknown> = {
      Subject: data.subject,
      What_Id: { id: data.caseId },
      $se_module: "SSDI_Cases",
      Status: "Not Started",
      Priority: data.priority ?? "Normal",
    };
    if (data.dueDate) payload.Due_Date = data.dueDate;
    if (data.ownerId) payload.Owner = { id: data.ownerId };
    if (data.description) payload.Description = data.description;
    const res = await makeZohoClient().as(context.userId).createRecords("Tasks", [payload]);
    const first = (res?.[0] ?? {}) as { details?: { id?: string }; code?: string; message?: string };
    if (first.code && first.code !== "SUCCESS") {
      throw new Error(first.message || "Failed to create task");
    }
    await logCaseActivity({
      caseId: data.caseId,
      actorUserId: context.userId,
      actorEmail: actorEmail(context.claims),
      action: "task.create",
      summary: `Created task "${data.subject}"${data.dueDate ? ` (due ${data.dueDate})` : ""}.`,
      metadata: { subject: data.subject, dueDate: data.dueDate, priority: data.priority, ownerId: data.ownerId },
    });
    return { ok: true, id: first.details?.id };
  });

export const getCaseTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => caseIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const rows = await makeZohoClient()
      .as(context.userId)
      .getRelated("SSDI_Cases", data.caseId, "Tasks", [
        "id","Subject","Status","Priority","Due_Date","Owner","Description","Created_Time","Modified_Time","Closed_Time",
      ]);
    return { rows: toJson<ZohoRow[]>(rows) };
  });

export const listZohoUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const users = await makeZohoClient().as(context.userId).listActiveUsers();
    return { users };
  });

// ---------- Dev: seed an SSDI case with realistic test data ----------

const seedTestCaseInput = z.object({ caseId: z.string().regex(/^[A-Za-z0-9_]+$/) });

/**
 * Fill in a representative set of SSDI_Cases fields so the UI has real data
 * to render. Does NOT change Current_Stage. Notice_Date is set ~20 days ago
 * so the appeal deadline lands ~45 days out (visible on the Deadline panel).
 */
export const seedTestCaseData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => seedTestCaseInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const { createCaseService } = await import("@/integrations/zoho/caseService");

    const iso = (offset: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    };

    const payload: Record<string, unknown> = {
      id: data.caseId,
      Notice_Date: iso(-20),
      Date_Opened: iso(-60),
      Application_Filed_Date: iso(-55),
      Initial_Decision_Date: iso(-22),
      Sub_Status: "Awaiting decision",
      Hearing_Office_ODAR: "ODAR — San Francisco",
      ALJ_Name: "Hon. Patricia Reyes",
      Back_Pay_Amount: 35000,
      Monthly_Benefit: 1850,
      Entitlement_Date: iso(-180),
      Release_Signed_Date: iso(-50),
      DIB_Claim: true,
      Claim_Type: "DIB (Title II)",
      Onset_Date: iso(-540),
      Last_Worked_Date: iso(-520),
      DLI: iso(180),
      Disability_Type: "Physical",
      Primary_Impairment: "Lumbar degenerative disc disease w/ radiculopathy",
      Secondary_Impairments: "Major depressive disorder; chronic migraines",
      SSA_Claim_Number: "555-22-9999A",
    };

    await makeZohoClient().as(context.userId).updateRecords("SSDI_Cases", [payload]);
    // Recompute deadline so Days_To_Deadline / Deadline_At_Risk are fresh.
    const svc = createCaseService({ zoho: makeZohoClient() });
    await svc.recomputeDeadline(context.userId, data.caseId);
    return { ok: true };
  });



// ---------- Intake (new SSDI client wizard) ----------

const conflictInput = z.object({
  lastName: z.string().trim().max(200).optional(),
  email: z.string().trim().max(320).optional(),
});

export const intakeConflictCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => conflictInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const { createIntakeService } = await import("@/integrations/zoho/intakeService");
    const svc = createIntakeService({ zoho: makeZohoClient() });
    const result = await svc.runConflictCheck(context.userId, data);
    return toJson<{ status: "Cleared" | "Conflict found"; matches: ZohoRow[] }>(result);
  });

const intakeInput = z.object({
  clientId: z.string().regex(/^[A-Za-z0-9_]+$/).optional(),
  client: z.object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.string().trim().max(320).optional(),
    mobile: z.string().trim().max(40).optional(),
    homePhone: z.string().trim().max(40).optional(),
    dob: z.string().optional(),
    ssn: z.string().trim().max(20).optional(),
    referralSourceId: z.string().regex(/^[A-Za-z0-9_]+$/).optional(),
    leadSource: z.string().trim().max(100).optional(),
    mailingStreet: z.string().trim().max(250).optional(),
    mailingCity: z.string().trim().max(100).optional(),
    mailingState: z.string().trim().max(100).optional(),
    mailingZip: z.string().trim().max(20).optional(),
  }),
  conflict: z.object({
    status: z.enum(["Cleared", "Conflict found"]),
    note: z.string().trim().max(2000).optional(),
  }),
  ssdi: z.object({
    claimType: z.enum(["DIB (Title II)", "SSI (Title XVI)", "Concurrent"]).optional(),
    onset: z.string().optional(),
    lastWorked: z.string().optional(),
    dli: z.string().optional(),
    disabilityType: z.enum(["Physical", "Mental", "Both"]).optional(),
    primaryImpairment: z.string().trim().max(500).optional(),
    secondaryImpairments: z.string().trim().max(2000).optional(),
    ssaClaimNumber: z.string().trim().max(50).optional(),
  }),
});

export const intakeCreate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => intakeInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const { createIntakeService } = await import("@/integrations/zoho/intakeService");
    const client = makeZohoClient();
    const actorZohoUserId = (await client.as(context.userId).currentUserId()) ?? undefined;
    const svc = createIntakeService({ zoho: client });
    const result = await svc.createIntake(context.userId, { ...data, actorZohoUserId });
    return result;
  });


// ---------- Retainer (Zoho Sign) ----------

export const retainerSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => engagementIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeRetainerService } = await import("@/integrations/zoho/signClient.server");
    const svc = makeRetainerService();
    const result = await svc.sendRetainer(context.userId, data.engagementId);
    return result;
  });

// ---------- SSA intake forms (Zoho Sign) ----------

const sendFormInput = z.object({
  caseId: z.string().regex(/^[A-Za-z0-9_]+$/),
  code: z.enum(["SSA-1696", "SSA-827", "SSA-1693"]),
  /** SSA-827 requires the attorney to confirm the SSA attestation procedure was followed. */
  attested: z.boolean().optional(),
});

export const sendIntakeForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => sendFormInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeFormsService } = await import("@/integrations/zoho/signClient.server");
    return makeFormsService().sendForm(context.userId, data.caseId, data.code, {
      attested: data.attested,
    });
  });




// ---------- Costs ----------

/**
 * Cost categories surfaced in the case-page entry form. These are the
 * common SSDI matter expenses; firms can extend the picklist in Zoho later
 * without breaking the form (Zoho will store any string in Cost_Type).
 *
 * NOTE: The Costs module has NO Date_Incurred field — do not add one here.
 */
export const COST_CATEGORIES = [
  "Medical records",
  "Expert / consultative exam",
  "Postage / shipping",
  "Filing fee",
  "Travel",
  "Copies / printing",
  "Other",
] as const;

const createCostInput = z.object({
  engagementId: z.string().regex(/^[A-Za-z0-9_]+$/),
  name: z.string().trim().min(1, "Description is required").max(200),
  amount: z.number().finite().min(0).max(1_000_000),
  costType: z.enum(COST_CATEGORIES),
});

export const createCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => createCostInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const { logCaseActivity } = await import("@/integrations/audit/log.server");
    const payload: Record<string, unknown> = {
      Name: data.name,
      Amount: data.amount,
      Cost_Type: data.costType,
      Engagement: { id: data.engagementId },
    };
    const res = await makeZohoClient().as(context.userId).createRecords("Costs", [payload]);
    const first = (res?.[0] ?? {}) as { details?: { id?: string }; code?: string; message?: string };
    if (first.code && first.code !== "SUCCESS") {
      throw new Error(first.message || "Failed to create cost");
    }
    await logCaseActivity({
      engagementId: data.engagementId,
      actorUserId: context.userId,
      actorEmail: actorEmail(context.claims),
      action: "cost.create",
      summary: `Added cost "${data.name}" — $${data.amount.toFixed(2)} (${data.costType}).`,
      metadata: { name: data.name, amount: data.amount, costType: data.costType, costId: first.details?.id },
    });
    return { ok: true, id: first.details?.id };
  });

const deleteCostInput = z.object({
  costId: z.string().regex(/^[A-Za-z0-9_]+$/),
  engagementId: z.string().regex(/^[A-Za-z0-9_]+$/).optional(),
  costName: z.string().trim().max(200).optional(),
});

export const deleteCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => deleteCostInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const { logCaseActivity } = await import("@/integrations/audit/log.server");
    await makeZohoClient().as(context.userId).deleteRecords("Costs", [data.costId]);
    if (data.engagementId) {
      await logCaseActivity({
        engagementId: data.engagementId,
        actorUserId: context.userId,
        actorEmail: actorEmail(context.claims),
        action: "cost.delete",
        summary: data.costName ? `Deleted cost "${data.costName}".` : "Deleted a cost.",
        metadata: { costId: data.costId },
      });
    }
    return { ok: true };
  });



/**
 * Admin-only: trigger the SSDI nightly deadline sweep on demand. Logs the result to
 * public.ssdi_deadline_digests, same as the scheduled cron.
 */
export const runDeadlineSweepNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const { createCaseService } = await import("@/integrations/zoho/caseService");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncAllOpenCases } = await import("@/integrations/zoho/caseCalendarSync");

    const result = await createCaseService({ zoho: makeZohoClient() }).runDailyDeadlineSweep();
    // After recomputing deadlines, reconcile the calendar so date changes flow through.
    // Calendar errors must not fail the sweep — capture and log.
    let cal = { created: 0, updated: 0, deleted: 0, errors: 0 };
    try {
      cal = await syncAllOpenCases();
    } catch (e) {
      console.error("[deadline-sweep] calendar sync failed:", e);
      cal.errors++;
    }
    await supabaseAdmin.from("ssdi_deadline_digests").insert({
      scanned: result.scanned,
      updated: result.updated,
      overdue: result.overdue as never,
      due_soon: result.dueSoon as never,
      release_expiring: result.releaseExpiring as never,
      calendar_created: cal.created,
      calendar_updated: cal.updated,
      calendar_deleted: cal.deleted,
      calendar_errors: cal.errors,
    });
    return {
      scanned: result.scanned,
      updated: result.updated,
      overdueCount: result.overdue.length,
      dueSoonCount: result.dueSoon.length,
      releaseExpiringCount: result.releaseExpiring.length,
      calendar: cal,
    };
  });
