/**
 * NotesPanel — staff-only human case-notes log.
 *
 * Distinct from ActivityPanel (which renders the auto audit log). Notes are
 * pinned-first then newest-first. Authors and admins can edit/delete; everyone
 * with staff role can add and pin.
 *
 * RLS on `public.case_notes` is the authoritative gate — this panel just
 * mirrors that surface and is never rendered in the client portal.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listCaseNotes,
  addCaseNote,
  updateCaseNote,
  togglePinNote,
  deleteCaseNote,
  NOTE_TYPES,
  type NoteType,
  type CaseNoteRow,
} from "@/lib/caseNotes.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pin, PinOff, Pencil, Trash2, NotebookPen, X, Check } from "lucide-react";
import { toast } from "sonner";

const TYPE_LABEL: Record<NoteType, string> = {
  general: "General",
  phone_call: "Phone call",
  client_meeting: "Client meeting",
  ssa_oho_contact: "SSA / OHO contact",
  internal_strategy: "Internal strategy",
};

const TYPE_COLOR: Record<NoteType, string> = {
  general: "bg-muted text-muted-foreground border-border",
  phone_call: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
  client_meeting: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  ssa_oho_contact: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
  internal_strategy: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export function NotesPanel({ caseId }: { caseId: string }) {
  const qc = useQueryClient();
  const fetchNotes = useServerFn(listCaseNotes);
  const addFn = useServerFn(addCaseNote);
  const updateFn = useServerFn(updateCaseNote);
  const pinFn = useServerFn(togglePinNote);
  const deleteFn = useServerFn(deleteCaseNote);

  const [me, setMe] = useState<{ id: string | null; isAdmin: boolean }>({ id: null, isAdmin: false });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (!cancelled) setMe({ id: user.id, isAdmin: Boolean(data) });
    })();
    return () => { cancelled = true; };
  }, []);

  const q = useQuery({
    queryKey: ["case-notes", caseId],
    queryFn: () => fetchNotes({ data: { caseId } }),
  });
  const rows: CaseNoteRow[] = q.data?.rows ?? [];

  const [body, setBody] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("general");
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<NoteType | "all">("all");

  const visible = filter === "all" ? rows : rows.filter((r) => r.note_type === filter);

  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["case-notes", caseId] }),
      qc.invalidateQueries({ queryKey: ["case-activity", caseId] }),
    ]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      await addFn({ data: { caseId, body: body.trim(), noteType } });
      setBody("");
      setNoteType("general");
      await invalidate();
      toast.success("Note added.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add note.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-2">
          <NotebookPen className="h-3.5 w-3.5" /> Notes
          <span className="text-muted-foreground/70 normal-case tracking-normal text-[11px]">
            · internal · {rows.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Filter</span>
          <Select value={filter} onValueChange={(v) => setFilter(v as NoteType | "all")}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {NOTE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-2 rounded-md border border-border/60 bg-background/40 p-3">
        <div className="flex items-center gap-2">
          <Select value={noteType} onValueChange={(v) => setNoteType(v as NoteType)}>
            <SelectTrigger className="h-8 w-[200px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NOTE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[11px] text-muted-foreground">Internal — not visible to the client.</span>
        </div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note — what happened, who you spoke with, advice given, next steps…"
          rows={3}
          className="text-sm"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!body.trim() || submitting}>
            {submitting ? "Saving…" : "Save note"}
          </Button>
        </div>
      </form>

      {q.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-xs text-destructive">{(q.error as Error).message}</p>}
      {!q.isLoading && visible.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {rows.length === 0 ? "No notes yet." : "No notes match this filter."}
        </p>
      )}

      <ol className="space-y-2">
        {visible.map((n) => (
          <NoteRow
            key={n.id}
            note={n}
            canEdit={Boolean(me.id && (me.isAdmin || n.author_id === me.id))}
            onPin={async () => {
              try {
                await pinFn({ data: { id: n.id, pinned: !n.pinned } });
                await invalidate();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Couldn't update pin.");
              }
            }}
            onSave={async (next) => {
              try {
                await updateFn({ data: { id: n.id, body: next.body, noteType: next.noteType } });
                await invalidate();
                toast.success("Note updated.");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Couldn't update note.");
              }
            }}
            onDelete={async () => {
              if (!confirm("Delete this note? This cannot be undone.")) return;
              try {
                await deleteFn({ data: { id: n.id } });
                await invalidate();
                toast.success("Note deleted.");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Couldn't delete note.");
              }
            }}
          />
        ))}
      </ol>
    </section>
  );
}

function NoteRow({
  note,
  canEdit,
  onPin,
  onSave,
  onDelete,
}: {
  note: CaseNoteRow;
  canEdit: boolean;
  onPin: () => void;
  onSave: (next: { body: string; noteType: NoteType }) => Promise<void>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const [noteType, setNoteType] = useState<NoteType>(note.note_type);
  const [busy, setBusy] = useState(false);

  return (
    <li
      className={`rounded-md border px-3 py-2 ${
        note.pinned ? "border-primary/40 bg-primary/[0.04]" : "border-border/60 bg-background/40"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 mt-0.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${TYPE_COLOR[note.note_type]}`}
        >
          {TYPE_LABEL[note.note_type]}
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <Select value={noteType} onValueChange={(v) => setNoteType(v as NoteType)}>
                <SelectTrigger className="h-8 w-[200px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="text-sm" />
            </div>
          ) : (
            <div className="text-sm whitespace-pre-wrap text-foreground">{note.body}</div>
          )}
          <div className="mt-1 text-[11px] text-muted-foreground">
            {formatWhen(note.created_at)}
            {note.author_email ? ` · ${note.author_email}` : ""}
            {note.updated_at && note.updated_at !== note.created_at ? " · edited" : ""}
            {note.pinned ? " · pinned" : ""}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-1">
          {editing ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || !body.trim()}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onSave({ body: body.trim(), noteType });
                    setEditing(false);
                  } finally {
                    setBusy(false);
                  }
                }}
                title="Save"
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setEditing(false); setBody(note.body); setNoteType(note.note_type); }}
                title="Cancel"
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={onPin} title={note.pinned ? "Unpin" : "Pin"}>
                {note.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              </Button>
              {canEdit && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(true)} title="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={onDelete} title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}
