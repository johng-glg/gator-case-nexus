/**
 * caseDocuments.functions.ts — per-case SSDI document checklist persistence.
 *
 * The checklist itself comes from the engine (`documents.ts`); status is stored
 * in `public.case_document_status` (firm-wide, durable, audit-logged). Replaces
 * the old per-browser localStorage in `DocumentChecklist.tsx`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DOC_STATUSES,
  documentByCode,
  documentsThroughStage,
  type DocStatus,
} from "@/integrations/zoho/documents";
import type { Stage } from "@/integrations/zoho/lifecycle";

const FIRM_DOMAIN = "gatorlawpc.com";

function ensureStaff(email: string | undefined | null) {
  if (!email || !email.toLowerCase().endsWith(`@${FIRM_DOMAIN}`)) {
    throw new Error("Firm staff only.");
  }
}

const listInput = z.object({
  caseId: z.string().min(1),
  currentStage: z.string().min(1),
});

export const listCaseDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => listInput.parse(d))
  .handler(async ({ data, context }) => {
    ensureStaff(context.claims?.email as string | undefined);

    const docs = documentsThroughStage(data.currentStage as Stage);
    const { data: rows, error } = await context.supabase
      .from("case_document_status")
      .select("doc_code, status, updated_at")
      .eq("case_id", data.caseId);
    if (error) throw new Error(error.message);

    const byCode = new Map<string, { status: DocStatus; updatedAt: string }>();
    for (const r of rows ?? []) {
      byCode.set(r.doc_code, {
        status: r.status as DocStatus,
        updatedAt: r.updated_at as string,
      });
    }

    return docs.map((d) => {
      const stored = byCode.get(d.code);
      return {
        code: d.code,
        label: d.label,
        phase: d.phase,
        url: d.url,
        required: !!d.required,
        status: (stored?.status ?? "To do") as DocStatus,
        updatedAt: stored?.updatedAt,
      };
    });
  });

const setInput = z.object({
  caseId: z.string().min(1),
  docCode: z.string().min(1),
  status: z.enum(["To do", "Sent", "Received", "Filed"]),
});

export const setDocumentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => setInput.parse(d))
  .handler(async ({ data, context }) => {
    ensureStaff(context.claims?.email as string | undefined);

    const doc = documentByCode(data.docCode);
    if (!doc) throw new Error(`Unknown document code: ${data.docCode}`);
    if (!(DOC_STATUSES as readonly string[]).includes(data.status)) {
      throw new Error(`Invalid status: ${data.status}`);
    }

    const { error } = await context.supabase
      .from("case_document_status")
      .upsert(
        {
          case_id: data.caseId,
          doc_code: data.docCode,
          status: data.status,
          updated_by: context.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "case_id,doc_code" },
      );
    if (error) throw new Error(error.message);

    // Fire-and-forget audit entry; service-role write so RLS can't block it.
    try {
      const { logCaseActivity } = await import("@/integrations/audit/log.server");
      await logCaseActivity({
        caseId: data.caseId,
        actorUserId: context.userId,
        actorEmail: (context.claims?.email as string | undefined) ?? null,
        action: "document.upload",
        summary: `Marked ${doc.label} as ${data.status}`,
        metadata: { docCode: doc.code, status: data.status, phase: doc.phase },
      });
    } catch (err) {
      console.error("[caseDocuments] audit log failed", err);
    }

    return { ok: true as const };
  });
