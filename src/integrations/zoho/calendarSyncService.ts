/**
 * calendarSyncService.ts — orchestrates Google Calendar sync for an SSDI case (idempotent).
 *
 * Wires the pure engine (calendarService.desiredEventsForCase + reconcile) to a Google adapter and a
 * link store. Re-running creates nothing new, updates only changed events, deletes orphans — same
 * idempotency guarantee as the retainer/forms services. Call syncCase from the nightly sweep and on
 * stage-advance / case-date edits.
 */

import { desiredEventsForCase, reconcile, signature, type CalEvent } from "./calendarService";
import type { ZohoRecord } from "./zohoClient";

/** Thin Google Calendar transport (Lovable maps CalEvent → Google event shape). */
export interface GoogleCalendarAdapter {
  insert(calendarId: string, event: CalEvent): Promise<string>; // → google event id
  update(calendarId: string, eventId: string, event: CalEvent): Promise<void>;
  remove(calendarId: string, eventId: string): Promise<void>;
}

/** Persisted key → {eventId, sig} per case (table calendar_event_links). */
export interface CalendarLinkStore {
  get(caseId: string): Promise<Record<string, { eventId: string; sig: string }>>;
  upsert(caseId: string, key: string, eventId: string, sig: string): Promise<void>;
  remove(caseId: string, key: string): Promise<void>;
}

export interface CalendarSyncDeps {
  cal: GoogleCalendarAdapter;
  links: CalendarLinkStore;
  calendarId: string;
}

export function createCalendarSyncService(deps: CalendarSyncDeps) {
  /**
   * Reconcile one case's calendar events. `caseRecord` carries Is_Closed / Deadline_Date /
   * Active_Deadline_Type / ALJ_Hearing_Scheduled_Date / Hearing_Office_ODAR / ALJ_Name.
   */
  async function syncCase(
    caseRecord: ZohoRecord,
    meta: { caseId: string; label: string; caseUrl?: string },
  ): Promise<{ caseId: string; created: number; updated: number; deleted: number }> {
    const desired = desiredEventsForCase(caseRecord, meta);
    const existing = await deps.links.get(meta.caseId);
    let created = 0, updated = 0, deleted = 0;

    for (const a of reconcile(desired, existing)) {
      if (a.op === "create") {
        const eventId = await deps.cal.insert(deps.calendarId, a.event);
        await deps.links.upsert(meta.caseId, a.key, eventId, signature(a.event));
        created++;
      } else if (a.op === "update") {
        await deps.cal.update(deps.calendarId, a.eventId, a.event);
        await deps.links.upsert(meta.caseId, a.key, a.eventId, signature(a.event));
        updated++;
      } else {
        await deps.cal.remove(deps.calendarId, a.eventId);
        await deps.links.remove(meta.caseId, a.key);
        deleted++;
      }
    }
    return { caseId: meta.caseId, created, updated, deleted };
  }

  return { syncCase };
}
