/**
 * documents.functions.ts — Document request flow.
 *
 * Staff create document requests for a case. Clients (and staff) upload files via
 * short-lived signed URLs to the private `case-documents` bucket. Uploads land at
 * `cases/{case_id}/{request_id|adhoc}/{uuid}-{filename}` and are recorded in
 * `public.document_uploads`. RLS denies direct table reads; all access is
 * intermediated by these server fns so we can authorize each call.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FIRM_DOMAIN = "gatorlawpc.com";
const BUCKET = "case-documents";
const ID_RE = /^[A-Za-z0-9_]+$/;
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB cap per upload

function isStaff(email: string | undefined | null): boolean {
  return !!email && email.toLowerCase().endsWith(`@${FIRM_DOMAIN}`);
}

function sanitizeName(name: string): string {
  const trimmed = name.trim().slice(0, 180);
  return trimmed.replace(/[^\w.\- ]+/g, "_") || "file";
}

async function getEngagementClientId(engagementId: string): Promise<string | null> {
  const { makeZohoClient } = await import("@/integrations/zoho/client.server");
  const zoho = makeZohoClient().service();
  const engagement = await zoho.getRecord<{ Client?: { id?: string } | string }>(
    "Engagements",
    engagementId,
    ["Client"],
  );
  const client = engagement?.Client;
  return (typeof client === "string" ? client : client?.id) ?? null;
}

async function getCaseEngagementId(caseId: string): Promise<string | null> {
  const { makeZohoClient } = await import("@/integrations/zoho/client.server");
  const zoho = makeZohoClient().service();
  const caseRecord = await zoho.getRecord<{ Engagement?: { id?: string } | string }>(
    "SSDI_Cases",
    caseId,
    ["Engagement"],
  );
  const engagement = caseRecord?.Engagement;
  return (typeof engagement === "string" ? engagement : engagement?.id) ?? null;
}

async function getCaseIdForEngagement(engagementId: string): Promise<string | null> {
  const { makeZohoClient } = await import("@/integrations/zoho/client.server");
  const zoho = makeZohoClient().service();
  const cases = await zoho
    .coql<{ id: string }>(
      `select id from SSDI_Cases where Engagement = '${engagementId}' limit 1`,
    )
    .catch(() => [] as { id: string }[]);
  return cases[0]?.id ?? null;
}

async function getClientContactId(userId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("client_portal_contacts")
    .select("zoho_contact_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.zoho_contact_id ?? null;
}

async function getClientDocumentScope(
  userId: string,
  requested?: { caseId?: string; engagementId?: string },
): Promise<{ case_id: string | null; engagement_id: string | null } | null> {
  const contactId = await getClientContactId(userId);

  if (contactId) {
    if (requested?.caseId) {
      const engagementId = await getCaseEngagementId(requested.caseId);
      if (!engagementId) return null;
      const clientId = await getEngagementClientId(engagementId);
      return clientId === contactId
        ? { case_id: requested.caseId, engagement_id: engagementId }
        : null;
    }

    if (requested?.engagementId) {
      const clientId = await getEngagementClientId(requested.engagementId);
      if (clientId !== contactId) return null;
      return {
        case_id: await getCaseIdForEngagement(requested.engagementId),
        engagement_id: requested.engagementId,
      };
    }
  }

  const legacy = await getClientLink(userId);
  if (!legacy) return null;
  if (requested?.caseId && legacy.case_id !== requested.caseId) return null;
  if (requested?.engagementId && legacy.engagement_id !== requested.engagementId) return null;
  return legacy;
}

async function clientCanAccessCase(userId: string, caseId: string): Promise<boolean> {
  const scope = await getClientDocumentScope(userId, { caseId });
  return scope?.case_id === caseId;
}

async function getClientLink(
  userId: string,
): Promise<{ case_id: string; engagement_id: string | null } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("client_portal_links")
    .select("zoho_case_id, zoho_engagement_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !data.zoho_case_id) return null;
  return { case_id: data.zoho_case_id, engagement_id: data.zoho_engagement_id };
}


/** Staff-only: create a new document request for a case. */
export const createDocumentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      caseId: z.string().regex(ID_RE),
      engagementId: z.string().regex(ID_RE).optional(),
      label: z.string().trim().min(1).max(160),
      instructions: z.string().trim().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const email = (context.claims as { email?: string }).email;
    if (!isStaff(email)) throw new Error("Forbidden: firm staff only.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("document_requests")
      .insert({
        case_id: data.caseId,
        engagement_id: data.engagementId ?? null,
        label: data.label,
        instructions: data.instructions ?? null,
        created_by: context.userId,
        created_by_email: email,
      })
      .select("id, label, status, created_at")
      .single();
    if (error) throw new Error(error.message);

    const { logCaseActivity } = await import("@/integrations/audit/log.server");
    await logCaseActivity({
      caseId: data.caseId,
      engagementId: data.engagementId ?? null,
      actorUserId: context.userId,
      actorEmail: email,
      action: "document.request.create",
      summary: `Requested document: ${data.label}.`,
      metadata: { requestId: row.id },
    });
    const { notifySafe } = await import("@/integrations/messaging/notifyService.server");
    await notifySafe({ caseId: data.caseId, trigger: { kind: "event", event: "documents-requested" } });
    return { request: row };
  });

/** Staff-only: cancel an open request. */
export const cancelDocumentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const email = (context.claims as { email?: string }).email;
    if (!isStaff(email)) throw new Error("Forbidden: firm staff only.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("document_requests")
      .update({ status: "canceled", canceled_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "open")
      .select("id, case_id, engagement_id, label")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Request not found or already closed.");

    const { logCaseActivity } = await import("@/integrations/audit/log.server");
    await logCaseActivity({
      caseId: row.case_id,
      engagementId: row.engagement_id,
      actorUserId: context.userId,
      actorEmail: email,
      action: "document.request.cancel",
      summary: `Canceled document request: ${row.label}.`,
      metadata: { requestId: row.id },
    });
    return { ok: true };
  });

interface CaseDocsView {
  requests: Array<{
    id: string;
    label: string;
    instructions: string | null;
    status: "open" | "fulfilled" | "canceled";
    created_at: string;
    created_by_email: string | null;
    fulfilled_at: string | null;
    upload_count: number;
  }>;
  uploads: Array<{
    id: string;
    request_id: string | null;
    original_name: string;
    size_bytes: number | null;
    mime_type: string | null;
    uploaded_at: string;
    uploaded_by_email: string | null;
  }>;
}

/** Staff-only: list every request + upload for a case. */
export const getCaseDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ caseId: z.string().regex(ID_RE) }).parse(d))
  .handler(async ({ data, context }): Promise<CaseDocsView> => {
    const email = (context.claims as { email?: string }).email;
    if (!isStaff(email)) throw new Error("Forbidden: firm staff only.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [reqs, ups] = await Promise.all([
      supabaseAdmin
        .from("document_requests")
        .select("id, label, instructions, status, created_at, created_by_email, fulfilled_at")
        .eq("case_id", data.caseId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("document_uploads")
        .select("id, request_id, original_name, size_bytes, mime_type, uploaded_at, uploaded_by_email")
        .eq("case_id", data.caseId)
        .order("uploaded_at", { ascending: false }),
    ]);
    if (reqs.error) throw new Error(reqs.error.message);
    if (ups.error) throw new Error(ups.error.message);

    const uploadCounts = new Map<string, number>();
    for (const u of ups.data ?? []) {
      if (u.request_id) uploadCounts.set(u.request_id, (uploadCounts.get(u.request_id) ?? 0) + 1);
    }
    return {
      requests: (reqs.data ?? []).map((r) => ({
        ...r,
        status: r.status as "open" | "fulfilled" | "canceled",
        upload_count: uploadCounts.get(r.id) ?? 0,
      })),
      uploads: ups.data ?? [],
    };
  });

const clientDocsInput = z
  .object({
    caseId: z.string().regex(ID_RE).optional(),
    engagementId: z.string().regex(ID_RE).optional(),
  })
  .optional();

/** Client-facing: list this client's own pending requests + their uploads. */
export const getMyDocumentRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => clientDocsInput.parse(d))
  .handler(async ({ data, context }) => {
    const link = await getClientDocumentScope(context.userId, data);
    if (!link || (!link.case_id && !link.engagement_id)) return { linked: false as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let reqQuery = supabaseAdmin
      .from("document_requests")
      .select("id, label, instructions, status, created_at, fulfilled_at")
      .order("created_at", { ascending: false });

    if (link.case_id && link.engagement_id) {
      reqQuery = reqQuery.or(`case_id.eq.${link.case_id},engagement_id.eq.${link.engagement_id}`);
    } else if (link.case_id) {
      reqQuery = reqQuery.eq("case_id", link.case_id);
    } else {
      reqQuery = reqQuery.eq("engagement_id", link.engagement_id!);
    }

    const uploadQuery = link.case_id
      ? supabaseAdmin
          .from("document_uploads")
          .select("id, request_id, original_name, size_bytes, uploaded_at")
          .eq("case_id", link.case_id)
          .eq("uploaded_by_user", context.userId)
          .order("uploaded_at", { ascending: false })
      : Promise.resolve({ data: [], error: null });

    const [reqs, ups] = await Promise.all([reqQuery, uploadQuery]);
    if (reqs.error) throw new Error(reqs.error.message);
    if (ups.error) throw new Error(ups.error.message);
    return {
      linked: true as const,
      requests: reqs.data ?? [],
      uploads: ups.data ?? [],
    };
  });

/**
 * Issue a short-lived signed PUT URL to upload one file. Auth: staff (any case)
 * or the linked client (their own case only). `requestId` is optional — null
 * means an ad-hoc upload not tied to a specific request.
 */
export const getUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      caseId: z.string().regex(ID_RE),
      requestId: z.string().uuid().nullable().optional(),
      fileName: z.string().min(1).max(200),
      size: z.number().int().nonnegative().max(MAX_BYTES),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const email = (context.claims as { email?: string }).email ?? null;
    if (!isStaff(email)) {
      if (!(await clientCanAccessCase(context.userId, data.caseId))) throw new Error("Forbidden.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // If a request is provided, validate it belongs to this case and is open.
    if (data.requestId) {
      const { data: req, error } = await supabaseAdmin
        .from("document_requests")
        .select("id, case_id, engagement_id, status")
        .eq("id", data.requestId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const caseEngagementId = req?.case_id === data.caseId ? null : await getCaseEngagementId(data.caseId);
      const matchesRequest =
        req?.case_id === data.caseId ||
        (!!req?.engagement_id && req.engagement_id === caseEngagementId);
      if (!req || !matchesRequest) throw new Error("Request not found.");
      if (req.status !== "open") throw new Error("This request is no longer open.");
    }

    const safe = sanitizeName(data.fileName);
    const folder = data.requestId ?? "adhoc";
    const objectId = crypto.randomUUID();
    const storagePath = `cases/${data.caseId}/${folder}/${objectId}-${safe}`;

    const { data: signed, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);
    if (error) throw new Error(error.message);

    return {
      storagePath,
      signedUrl: signed.signedUrl,
      token: signed.token,
    };
  });

/** Record an upload after the client PUTs the file to the signed URL. */
export const recordUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      caseId: z.string().regex(ID_RE),
      requestId: z.string().uuid().nullable().optional(),
      storagePath: z.string().min(1).max(500),
      originalName: z.string().min(1).max(200),
      size: z.number().int().nonnegative().max(MAX_BYTES),
      mime: z.string().max(120).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const email = (context.claims as { email?: string }).email ?? null;
    const staff = isStaff(email);
    if (!staff) {
      if (!(await clientCanAccessCase(context.userId, data.caseId))) throw new Error("Forbidden.");
    }
    // Defense in depth: storage path must be under cases/{caseId}/
    if (!data.storagePath.startsWith(`cases/${data.caseId}/`)) {
      throw new Error("Invalid storage path.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("document_uploads")
      .insert({
        case_id: data.caseId,
        request_id: data.requestId ?? null,
        storage_path: data.storagePath,
        original_name: data.originalName,
        size_bytes: data.size,
        mime_type: data.mime ?? null,
        uploaded_by_user: context.userId,
        uploaded_by_email: email,
      })
      .select("id, original_name, request_id")
      .single();
    if (error) throw new Error(error.message);

    // Mark linked request fulfilled (first upload only).
    let engagementId: string | null = null;
    if (data.requestId) {
      const { data: req } = await supabaseAdmin
        .from("document_requests")
        .update({ status: "fulfilled", fulfilled_at: new Date().toISOString() })
        .eq("id", data.requestId)
        .eq("status", "open")
        .select("engagement_id")
        .maybeSingle();
      engagementId = req?.engagement_id ?? null;
    }

    const { logCaseActivity } = await import("@/integrations/audit/log.server");
    await logCaseActivity({
      caseId: data.caseId,
      engagementId,
      actorUserId: context.userId,
      actorEmail: email,
      action: "document.upload",
      summary: `${staff ? "Staff" : "Client"} uploaded: ${row.original_name}.`,
      metadata: { uploadId: row.id, requestId: row.request_id ?? null },
    });
    if (data.requestId) {
      const { notifySafe } = await import("@/integrations/messaging/notifyService.server");
      await notifySafe({ caseId: data.caseId, trigger: { kind: "event", event: "documents-received" } });
    }
    return { upload: row };
  });

/** Issue a short-lived signed download URL. Staff only. */
export const getDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ uploadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const email = (context.claims as { email?: string }).email;
    if (!isStaff(email)) throw new Error("Forbidden: firm staff only.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("document_uploads")
      .select("storage_path, original_name")
      .eq("id", data.uploadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("File not found.");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(row.storage_path, 60, { download: row.original_name });
    if (sErr) throw new Error(sErr.message);
    return { signedUrl: signed.signedUrl };
  });
