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


const queryInput = z.object({
  name: z.enum([
    "openCases",
    "myOpenCases",
    "deadlinesAtRisk",
    "deadlinesAll",
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
    const needsZohoUser = data.name === "myOpenCases" || data.name === "myEngagements";
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
      .getRecord("Leads", data.leadId);
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

export const convertLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => leadIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const { createIntakeService } = await import("@/integrations/zoho/intakeService");
    const svc = createIntakeService({ zoho: makeZohoClient() });
    const result = await svc.convertLead(context.userId, data.leadId);
    return toJson<{
      clientId: string; engagementId: string; leadId: string;
      conflict: { status: "Cleared" | "Conflict found"; matches: ZohoRow[] };
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
    const svc = createCaseService({ zoho: makeZohoClient() });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await svc.advanceStage(context.userId, data.caseId, data.toStage as any, {
      fields: data.fields,
    });
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

const taskIdInput = z.object({ taskId: z.string().regex(/^[A-Za-z0-9_]+$/) });

export const completeTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => taskIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    await makeZohoClient().as(context.userId).updateRecords("Tasks", [
      { id: data.taskId, Status: "Completed" },
    ]);
    return { ok: true };
  });

export const getCaseTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => caseIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const rows = await makeZohoClient()
      .as(context.userId)
      .getRelated("SSDI_Cases", data.caseId, "Tasks", [
        "id","Subject","Status","Priority","Due_Date","Owner","Description","Created_Time","Modified_Time",
      ]);
    return { rows: toJson<ZohoRow[]>(rows) };
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

