/**
 * caseCalendarSync.ts — server orchestration for Google Calendar sync.
 *
 * `syncCaseCalendar(caseId)` — loads the SSDI case + its existing link rows, runs
 * `reconcile(...)`, and executes the resulting create/update/delete actions against the
 * shared firm calendar. Persists the {eventId, sig} map in `calendar_event_links`.
 *
 * `syncAllOpenCases()` — used by the nightly sweep; iterates every open case via COQL
 * so newly-closed cases (and cases whose date was cleared) get their events deleted.
 *
 * Idempotency comes entirely from `reconcile` + the stored `sig`. Re-running this is
 * always safe.
 */

import {
  desiredEventsForCase,
  reconcile,
  signature,
  type CalEvent,
} from "./calendarService";
import { makeZohoClient } from "./client.server";
import { SERVICE_ACTOR, type ZohoRecord } from "./zohoClient";
import { makeGcalClient, type GcalClient } from "@/integrations/google/calendarClient.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MODULE = "SSDI_Cases";

const SYNC_FIELDS = [
  "id", "Case_Number", "Is_Closed",
  "Deadline_Date", "Active_Deadline_Type",
  "ALJ_Hearing_Scheduled_Date", "Hearing_Office_ODAR", "ALJ_Name",
];

export interface SyncCounts {
  created: number;
  updated: number;
  deleted: number;
  errors: number;
}

interface LinkRow {
  case_id: string;
  key: string;
  google_event_id: string;
  sig: string;
}

async function loadLinks(caseIds: string[]): Promise<Map<string, Record<string, { eventId: string; sig: string }>>> {
  const out = new Map<string, Record<string, { eventId: string; sig: string }>>();
  if (caseIds.length === 0) return out;
  const { data, error } = await supabaseAdmin
    .from("calendar_event_links")
    .select("case_id, key, google_event_id, sig")
    .in("case_id", caseIds);
  if (error) throw new Error(`loadLinks: ${error.message}`);
  for (const row of (data ?? []) as LinkRow[]) {
    const m = out.get(row.case_id) ?? {};
    m[row.key] = { eventId: row.google_event_id, sig: row.sig };
    out.set(row.case_id, m);
  }
  return out;
}

async function upsertLink(caseId: string, key: string, eventId: string, sig: string, calendarId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("calendar_event_links")
    .upsert(
      { case_id: caseId, key, google_event_id: eventId, sig, calendar_id: calendarId, updated_at: new Date().toISOString() },
      { onConflict: "case_id,key" },
    );
  if (error) throw new Error(`upsertLink: ${error.message}`);
}

async function deleteLink(caseId: string, key: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("calendar_event_links")
    .delete()
    .eq("case_id", caseId)
    .eq("key", key);
  if (error) throw new Error(`deleteLink: ${error.message}`);
}

/**
 * Sync one case. Tolerant of missing records (treated as "all events should be deleted").
 * Throws only if the gateway call fails AND retries would help — i.e. surface upstream.
 */
export async function syncCaseCalendar(caseId: string, opts?: { caseUrl?: string }): Promise<SyncCounts> {
  const gcal = makeGcalClient();
  const api = makeZohoClient().as(SERVICE_ACTOR);

  const record = (await api.getRecord<ZohoRecord>(MODULE, caseId, SYNC_FIELDS.slice(1))) ?? null;
  const links = await loadLinks([caseId]);
  const existing = links.get(caseId) ?? {};

  const desired: CalEvent[] = record
    ? desiredEventsForCase(
        { ...record, id: caseId },
        {
          caseId,
          label: (record.Case_Number as string) || caseId,
          caseUrl: opts?.caseUrl,
        },
      )
    : [];

  return runReconcile(caseId, desired, existing, gcal);
}

async function runReconcile(
  caseId: string,
  desired: CalEvent[],
  existing: Record<string, { eventId: string; sig: string }>,
  gcal: GcalClient,
): Promise<SyncCounts> {
  const counts: SyncCounts = { created: 0, updated: 0, deleted: 0, errors: 0 };
  for (const action of reconcile(desired, existing)) {
    try {
      if (action.op === "create") {
        const id = await gcal.insert(action.event);
        await upsertLink(caseId, action.key, id, signature(action.event), gcal.calendarId);
        counts.created++;
      } else if (action.op === "update") {
        await gcal.update(action.eventId, action.event);
        await upsertLink(caseId, action.key, action.eventId, signature(action.event), gcal.calendarId);
        counts.updated++;
      } else {
        await gcal.delete(action.eventId);
        await deleteLink(caseId, action.key);
        counts.deleted++;
      }
    } catch (err) {
      counts.errors++;
      console.error(`[calendar-sync] ${action.op} failed for ${caseId}/${action.key}:`, err);
    }
  }
  return counts;
}

/**
 * Sync every open case. Also catches stragglers: link rows for cases that no longer
 * exist (or are closed and have no desired events) get their events deleted.
 */
export async function syncAllOpenCases(): Promise<SyncCounts> {
  const gcal = makeGcalClient();
  const api = makeZohoClient().as(SERVICE_ACTOR);

  const rows = await api.coql<ZohoRecord>(
    `select ${SYNC_FIELDS.join(", ")} from ${MODULE} where Is_Closed = false`,
  );

  const caseIds = rows.map((r) => r.id as string).filter(Boolean);

  // Also include cases that have link rows but might no longer be in the open-cases list,
  // so we can delete their events too.
  const { data: linkedRows, error } = await supabaseAdmin
    .from("calendar_event_links")
    .select("case_id");
  if (error) throw new Error(`syncAllOpenCases: ${error.message}`);
  const linkedIds = new Set((linkedRows ?? []).map((r) => r.case_id as string));
  for (const id of caseIds) linkedIds.add(id);

  const links = await loadLinks([...linkedIds]);
  const byId = new Map(rows.map((r) => [r.id as string, r]));
  const totals: SyncCounts = { created: 0, updated: 0, deleted: 0, errors: 0 };

  for (const id of linkedIds) {
    const record = byId.get(id);
    const desired: CalEvent[] = record
      ? desiredEventsForCase(
          { ...record, id },
          { caseId: id, label: (record.Case_Number as string) || id },
        )
      : [];
    const existing = links.get(id) ?? {};
    const c = await runReconcile(id, desired, existing, gcal);
    totals.created += c.created;
    totals.updated += c.updated;
    totals.deleted += c.deleted;
    totals.errors += c.errors;
  }
  return totals;
}

/** Best-effort one-case sync; never throws — for use in user-facing mutation paths. */
export async function syncCaseCalendarSafe(caseId: string): Promise<SyncCounts | null> {
  try {
    return await syncCaseCalendar(caseId);
  } catch (err) {
    console.error(`[calendar-sync] safe sync failed for ${caseId}:`, err);
    return null;
  }
}
