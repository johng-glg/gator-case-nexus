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
    "releasesExpiringSoon",
    "pipelineByStage",
    "pipelineByPractice",
    "costsByEngagement",
    "casesByEngagement",
    "engagementById",
    "allEngagements",
    "engagementsByType",
    "myEngagements",
    "allContacts",
    "allLeads",
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


