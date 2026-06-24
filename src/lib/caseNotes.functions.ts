/**
 * caseNotes.functions.ts — staff-only human case-notes log (case_notes table).
 *
 * Distinct from the auto case_activity_log: this stores notes staff write
 * (phone calls, client meetings, SSA/OHO contacts, strategy, general).
 *
 * Uses the per-request authenticated supabase client — RLS on the table is the
 * authoritative gate. Inserts also audit a `note.added` row in case_activity_log
 * via the service-role logger so the audit trail records that a note exists
 * (never its body).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ID_RE = /^[A-Za-z0-9_]+$/;

export const NOTE_TYPES = [
  "general",
  "phone_call",
  "client_meeting",
  "ssa_oho_contact",
  "internal_strategy",
] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export type CaseNoteRow = {
  id: string;
  case_id: string;
  author_id: string;
  author_email: string | null;
  note_type: NoteType;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

function emailFromClaims(claims: unknown): string | null {
  if (claims && typeof claims === "object" && "email" in claims) {
    const e = (claims as { email?: unknown }).email;
    if (typeof e === "string") return e.toLowerCase();
  }
  return null;
}

export const listCaseNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ caseId: z.string().regex(ID_RE) }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("case_notes")
      .select("id, case_id, author_id, author_email, note_type, body, pinned, created_at, updated_at")
      .eq("case_id", data.caseId)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as CaseNoteRow[] };
  });

export const addCaseNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        caseId: z.string().regex(ID_RE),
        body: z.string().trim().min(1).max(20_000),
        noteType: z.enum(NOTE_TYPES).default("general"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const email = emailFromClaims(context.claims);
    const { data: row, error } = await context.supabase
      .from("case_notes")
      .insert({
        case_id: data.caseId,
        author_id: context.userId,
        author_email: email,
        note_type: data.noteType,
        body: data.body,
      })
      .select("id, case_id, author_id, author_email, note_type, body, pinned, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);

    // Fire-and-forget audit entry — records that a note was added, not its body.
    try {
      const { logCaseActivity } = await import("@/integrations/audit/log.server");
      await logCaseActivity({
        caseId: data.caseId,
        actorUserId: context.userId,
        actorEmail: email,
        action: "note.added",
        summary: `Note added (${data.noteType.replace(/_/g, " ")})`,
        metadata: { note_type: data.noteType, note_id: row.id },
      });
    } catch (err) {
      console.error("[caseNotes] audit log failed", err);
    }

    return { row: row as CaseNoteRow };
  });

export const updateCaseNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        body: z.string().trim().min(1).max(20_000).optional(),
        noteType: z.enum(NOTE_TYPES).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.body !== undefined) patch.body = data.body;
    if (data.noteType !== undefined) patch.note_type = data.noteType;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase.from("case_notes").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const togglePinNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid(), pinned: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("case_notes")
      .update({ pinned: data.pinned })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCaseNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("case_notes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
