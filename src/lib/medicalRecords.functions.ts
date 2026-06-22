/**
 * medicalRecords.functions.ts — per-case Records_Requests CRUD + lifecycle actions.
 *
 * Engine: src/integrations/zoho/medicalRecords.ts (pure, tested).
 * Storage: Zoho `Records_Requests` module, parent = SSDI_Cases via `SSDI_Case` lookup.
 * Costs row is created on the parent Engagement when Fee_Paid_Date transitions empty → set.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  REQUEST_STATUSES,
  agingDays,
  applyFollowup,
  canTransition,
  isStale,
  nextFollowupDate,
  type RecordsRequest,
  type RequestStatus,
} from "@/integrations/zoho/medicalRecords";
import { releaseExpiration } from "@/integrations/zoho/deadlines";

const FIRM_DOMAIN = "gatorlawpc.com";
function ensureStaff(email: string | undefined | null) {
  if (!email || !email.toLowerCase().endsWith(`@${FIRM_DOMAIN}`)) {
    throw new Error("Firm staff only.");
  }
}

const REQUEST_FIELDS = [
  "id",
  "Provider_Name",
  "Request_Status",
  "Requested_Date",
  "Last_Followup_Date",
  "Followup_Count",
  "Received_Date",
  "Pages_Received",
  "Fee_Amount",
  "Fee_Paid_Date",
  "SSDI_Case",
] as const;

const listInput = z.object({ caseId: z.string().min(1) });

export const listCaseRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => listInput.parse(d))
  .handler(async ({ data, context }) => {
    ensureStaff(context.claims?.email as string | undefined);
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const api = makeZohoClient().as(context.userId);

    const rows = await api.coql<RecordsRequest & { id: string }>(
      `select ${REQUEST_FIELDS.join(", ")} from Records_Requests where SSDI_Case = ${data.caseId}`,
    );

    const today = new Date();
    const decorated = rows.map((r) => ({
      ...r,
      _nextFollowup: nextFollowupDate(r),
      _agingDays: agingDays(r, today),
      _isStale: isStale(r, today),
    }));

    const counts = {
      total: decorated.length,
      open: decorated.filter((r) => r.Request_Status === "Requested" || r.Request_Status === "Followed up").length,
      stale: decorated.filter((r) => r._isStale).length,
      received: decorated.filter((r) => r.Request_Status === "Received").length,
    };

    return { rows: decorated, counts };
  });

const createInput = z.object({
  caseId: z.string().min(1),
  providerName: z.string().min(1).max(200),
});

export const createRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createInput.parse(d))
  .handler(async ({ data, context }) => {
    ensureStaff(context.claims?.email as string | undefined);
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const api = makeZohoClient().as(context.userId);

    const res = await api.createRecords("Records_Requests", [
      {
        Provider_Name: data.providerName,
        Request_Status: "Not started",
        Followup_Count: 0,
        SSDI_Case: { id: data.caseId },
      },
    ]);
    return { ok: true as const, result: res[0] ?? null };
  });

const sendInput = z.object({ requestId: z.string().min(1) });

export const sendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => sendInput.parse(d))
  .handler(async ({ data, context }) => {
    ensureStaff(context.claims?.email as string | undefined);
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const api = makeZohoClient().as(context.userId);

    const r = await api.getRecord<RecordsRequest & { id: string; SSDI_Case?: { id: string } | string }>(
      "Records_Requests",
      data.requestId,
      [...REQUEST_FIELDS],
    );
    if (!r) throw new Error("Records request not found.");

    const caseId = (r.SSDI_Case && typeof r.SSDI_Case === "object") ? (r.SSDI_Case as { id?: string }).id : (r.SSDI_Case as unknown as string | undefined);
    if (!caseId) throw new Error("Request is not attached to a case.");

    // 827 gate
    const sscase = await api.getRecord<{ Release_Signed_Date?: string }>("SSDI_Cases", caseId, [
      "Release_Signed_Date",
    ]);
    const signed = sscase?.Release_Signed_Date;
    if (!signed) throw new Error("SSA-827 release is not signed yet — cannot send records request.");
    if (releaseExpiration(signed).getTime() < Date.now()) {
      throw new Error("SSA-827 release has expired — re-sign before sending.");
    }

    const today = new Date().toISOString().slice(0, 10);
    await api.updateRecords("Records_Requests", [
      {
        id: data.requestId,
        Request_Status: "Requested",
        Requested_Date: today,
      },
    ]);

    return { ok: true as const, packetPending: true as const };
  });

const followupInput = z.object({ requestId: z.string().min(1) });

export const logFollowup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => followupInput.parse(d))
  .handler(async ({ data, context }) => {
    ensureStaff(context.claims?.email as string | undefined);
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const api = makeZohoClient().as(context.userId);

    const r = await api.getRecord<RecordsRequest & { id: string; SSDI_Case?: { id: string } | string }>(
      "Records_Requests",
      data.requestId,
      [...REQUEST_FIELDS],
    );
    if (!r) throw new Error("Records request not found.");
    if (r.Request_Status !== "Requested" && r.Request_Status !== "Followed up") {
      throw new Error(`Cannot follow up from status "${r.Request_Status}".`);
    }

    const updates = applyFollowup(r);
    await api.updateRecords("Records_Requests", [{ id: data.requestId, ...updates }]);

    const caseId = (r.SSDI_Case && typeof r.SSDI_Case === "object") ? (r.SSDI_Case as { id?: string }).id : (r.SSDI_Case as unknown as string | undefined);
    if (caseId) {
      try {
        const { logCaseActivity } = await import("@/integrations/audit/log.server");
        await logCaseActivity({
          caseId,
          actorUserId: context.userId,
          actorEmail: (context.claims?.email as string | undefined) ?? null,
          action: "records.followup",
          summary: `Logged follow-up #${updates.Followup_Count} for ${r.Provider_Name ?? "provider"}`,
          metadata: { requestId: data.requestId, count: updates.Followup_Count },
        });
      } catch (e) { console.error("[medicalRecords] audit failed", e); }
    }

    return { ok: true as const, ...updates };
  });

const statusInput = z.object({
  requestId: z.string().min(1),
  status: z.enum(REQUEST_STATUSES as unknown as [RequestStatus, ...RequestStatus[]]),
  pagesReceived: z.number().int().nonnegative().optional(),
  feeAmount: z.number().nonnegative().optional(),
  feePaid: z.boolean().optional(),
});

export const setRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => statusInput.parse(d))
  .handler(async ({ data, context }) => {
    ensureStaff(context.claims?.email as string | undefined);
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const api = makeZohoClient().as(context.userId);

    const r = await api.getRecord<RecordsRequest & { id: string; SSDI_Case?: { id: string } | string }>(
      "Records_Requests",
      data.requestId,
      [...REQUEST_FIELDS],
    );
    if (!r) throw new Error("Records request not found.");

    if (!canTransition(r.Request_Status, data.status)) {
      throw new Error(`Invalid transition: ${r.Request_Status} → ${data.status}`);
    }

    const today = new Date().toISOString().slice(0, 10);
    const update: Record<string, unknown> = { id: data.requestId, Request_Status: data.status };
    if (data.status === "Received") {
      update.Received_Date = today;
      if (data.pagesReceived !== undefined) update.Pages_Received = data.pagesReceived;
    }
    if (data.feeAmount !== undefined) update.Fee_Amount = data.feeAmount;

    // Cost-row guard: only on Fee_Paid_Date empty → set transition.
    const feePaidBefore = !!r.Fee_Paid_Date;
    const feePaidNow = data.feePaid === true;
    const shouldPostCost = !feePaidBefore && feePaidNow && (data.feeAmount ?? r.Fee_Amount ?? 0) > 0;
    if (feePaidNow && !feePaidBefore) update.Fee_Paid_Date = today;

    await api.updateRecords("Records_Requests", [update]);

    const caseId = (r.SSDI_Case && typeof r.SSDI_Case === "object") ? (r.SSDI_Case as { id?: string }).id : (r.SSDI_Case as unknown as string | undefined);

    if (shouldPostCost && caseId) {
      // Find parent Engagement for this SSDI_Case to attach the cost.
      const eng = await api.coql<{ id: string; Engagement?: { id: string } }>(
        `select id, Engagement from SSDI_Cases where id = ${caseId}`,
      );
      const engagementId = (eng[0]?.Engagement as { id: string } | undefined)?.id ?? null;
      if (engagementId) {
        try {
          await api.createRecords("Costs", [
            {
              Name: `Medical records — ${r.Provider_Name ?? "provider"}`,
              Category: "Medical records",
              Amount: data.feeAmount ?? r.Fee_Amount ?? 0,
              Engagement: { id: engagementId },
            },
          ]);
        } catch (e) {
          console.error("[medicalRecords] failed to post Cost row", e);
        }
      }
    }

    if (caseId) {
      try {
        const { logCaseActivity } = await import("@/integrations/audit/log.server");
        await logCaseActivity({
          caseId,
          actorUserId: context.userId,
          actorEmail: (context.claims?.email as string | undefined) ?? null,
          action: "records.status",
          summary: `Records request for ${r.Provider_Name ?? "provider"}: ${r.Request_Status} → ${data.status}`,
          metadata: { requestId: data.requestId, from: r.Request_Status, to: data.status, feePaid: feePaidNow },
        });
      } catch (e) { console.error("[medicalRecords] audit failed", e); }
    }

    return { ok: true as const, status: data.status };
  });
