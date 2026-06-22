/**
 * DeadlinePanel — primary surface for the SSA appeal-clock on a case.
 *
 * Shows: big days-remaining, the rule actually used (presumed +5 vs documented
 * receipt), the inputs that drive it (Notice Date, Documented Receipt Date),
 * inline editing, and a recompute button. The math lives server-side in
 * `deadlines.ts` and is refreshed via `caseRecomputeDeadline` /
 * `updateCaseDates`.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, Pencil, Check, X, CalendarCheck2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  caseRecomputeDeadline,
  updateCaseDates,
  getCaseCalendarStatus,
  resyncCaseCalendar,
} from "@/lib/zoho.functions";

type CaseRecord = Record<string, unknown>;

interface Props {
  caseId: string;
  record: CaseRecord;
}

function asString(v: unknown): string {
  return v === null || v === undefined || v === "" ? "" : String(v);
}

function asDateString(v: unknown): string {
  const s = asString(v);
  // Zoho dates come as "YYYY-MM-DD" already; accept ISO too.
  return s.length >= 10 ? s.slice(0, 10) : "";
}

export function DeadlinePanel({ caseId, record }: Props) {
  const qc = useQueryClient();
  const recompute = useServerFn(caseRecomputeDeadline);
  const updateDates = useServerFn(updateCaseDates);
  const fetchCalStatus = useServerFn(getCaseCalendarStatus);
  const resyncCal = useServerFn(resyncCaseCalendar);

  const calStatusQ = useQuery({
    queryKey: ["case-calendar-status", caseId],
    queryFn: () => fetchCalStatus({ data: { caseId } }),
    staleTime: 60_000,
  });
  const onCalendar = (calStatusQ.data?.keys ?? []).includes(`deadline:${caseId}`);
  const calConfigured = calStatusQ.data?.calendarConfigured ?? false;

  const [editing, setEditing] = useState<"notice" | "receipt" | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const noticeDate = asDateString(record.Notice_Date);
  const receiptDate = asDateString(record.Documented_Receipt_Date);
  const deadlineDate = asDateString(record.Deadline_Date);
  const days = typeof record.Days_To_Deadline === "number" ? record.Days_To_Deadline : null;
  const atRisk = record.Deadline_At_Risk === true;
  const activeType = asString(record.Active_Deadline_Type);

  const rule = receiptDate
    ? { label: "Documented receipt", detail: "60 days from documented receipt date." }
    : noticeDate
      ? { label: "Presumed receipt (+5)", detail: "Notice + 5 days presumed receipt, then 60 days. 20 CFR 404.901 / 404.3(b)." }
      : { label: "No notice date set", detail: "Enter a notice date to start the appeal clock." };

  async function invalidate() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["case", caseId] }),
      qc.invalidateQueries({ queryKey: ["case-calendar-status", caseId] }),
      qc.invalidateQueries({ queryKey: ["deadlinesAtRisk"] }),
      qc.invalidateQueries({ queryKey: ["deadlinesAll"] }),
      qc.invalidateQueries({ queryKey: ["ssdi-cases"] }),
      qc.invalidateQueries({ queryKey: ["case-activity", caseId] }),
    ]);
  }

  async function onRecompute() {
    setBusy(true);
    try {
      await recompute({ data: { caseId } });
      await invalidate();
      toast.success("Deadline recomputed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onResyncCalendar() {
    setBusy(true);
    try {
      const counts = await resyncCal({ data: { caseId } });
      await invalidate();
      const parts: string[] = [];
      if (counts.created) parts.push(`${counts.created} created`);
      if (counts.updated) parts.push(`${counts.updated} updated`);
      if (counts.deleted) parts.push(`${counts.deleted} deleted`);
      toast.success(parts.length ? `Calendar synced: ${parts.join(", ")}.` : "Calendar already in sync.");
      if (counts.errors) toast.warning(`${counts.errors} calendar error${counts.errors === 1 ? "" : "s"} — see logs.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(which: "notice" | "receipt") {
    setEditing(which);
    setDraft(which === "notice" ? noticeDate : receiptDate);
  }

  function cancelEdit() {
    setEditing(null);
    setDraft("");
  }

  async function saveEdit() {
    if (!editing) return;
    // Allow blank to clear (sends null).
    const value = draft.trim() === "" ? null : draft.trim();
    if (value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      toast.error("Date must be YYYY-MM-DD.");
      return;
    }
    setBusy(true);
    try {
      const payload =
        editing === "notice"
          ? { caseId, Notice_Date: value }
          : { caseId, Documented_Receipt_Date: value };
      await updateDates({ data: payload });
      await invalidate();
      toast.success(editing === "notice" ? "Notice date updated." : "Documented receipt updated.");
      cancelEdit();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const daysTone =
    days === null
      ? "text-muted-foreground"
      : days < 0
        ? "text-destructive"
        : days <= 14
          ? "text-destructive"
          : days <= 30
            ? "text-amber-600 dark:text-amber-400"
            : "text-foreground";

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Appeal deadline</div>
          {activeType && (
            <div className="mt-0.5 text-sm font-medium text-foreground">{activeType}</div>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={onRecompute} disabled={busy}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${busy ? "animate-spin" : ""}`} />
          Recompute
        </Button>
      </div>

      <div className="flex items-baseline gap-3">
        <div className={`text-5xl font-display tabular-nums ${daysTone}`}>
          {days === null ? "—" : days}
        </div>
        <div className="text-sm text-muted-foreground">
          {days === null
            ? "no deadline computed"
            : days < 0
              ? `days overdue (was ${deadlineDate || "—"})`
              : `days remaining · due ${deadlineDate || "—"}`}
        </div>
      </div>

      {atRisk && (
        <div className="inline-flex items-center gap-1.5 rounded-md bg-destructive/10 border border-destructive/30 px-2 py-1 text-xs font-medium text-destructive">
          <AlertTriangle className="h-3 w-3" /> At risk
        </div>
      )}

      <div className="rounded-md bg-muted/40 px-3 py-2 text-xs">
        <span className="font-medium text-foreground">Rule: {rule.label}.</span>{" "}
        <span className="text-muted-foreground">{rule.detail}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <DateRow
          label="Notice date"
          value={noticeDate}
          editing={editing === "notice"}
          draft={draft}
          setDraft={setDraft}
          onEdit={() => startEdit("notice")}
          onSave={saveEdit}
          onCancel={cancelEdit}
          busy={busy}
          helper="Date on the SSA notice."
        />
        <DateRow
          label="Documented receipt"
          value={receiptDate}
          editing={editing === "receipt"}
          draft={draft}
          setDraft={setDraft}
          onEdit={() => startEdit("receipt")}
          onSave={saveEdit}
          onCancel={cancelEdit}
          busy={busy}
          helper="Optional. Overrides the +5-day presumption."
        />
      </div>
    </section>
  );
}

function DateRow(props: {
  label: string;
  value: string;
  editing: boolean;
  draft: string;
  setDraft: (s: string) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  helper: string;
}) {
  return (
    <div className="rounded-md border border-border/60 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{props.label}</div>
        {!props.editing && (
          <button
            type="button"
            onClick={props.onEdit}
            className="text-muted-foreground hover:text-foreground"
            aria-label={`Edit ${props.label}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {props.editing ? (
        <div className="mt-1 flex items-center gap-1">
          <Input
            type="date"
            value={props.draft}
            onChange={(e) => props.setDraft(e.target.value)}
            className="h-8 text-sm"
            autoFocus
          />
          <Button size="sm" variant="ghost" onClick={props.onSave} disabled={props.busy} aria-label="Save">
            <Check className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={props.onCancel} disabled={props.busy} aria-label="Cancel">
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="mt-1 text-base tabular-nums">
          {props.value || <span className="text-muted-foreground/60">—</span>}
        </div>
      )}
      <div className="mt-0.5 text-[11px] text-muted-foreground">{props.helper}</div>
    </div>
  );
}
