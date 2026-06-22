/**
 * calendarClient.server.ts — Google Calendar gateway adapter.
 *
 * Wraps the Lovable connector gateway for Calendar v3 (insert/update/delete events).
 * Server-only. Reads `LOVABLE_API_KEY` + `GOOGLE_CALENDAR_API_KEY` (injected by the
 * connector) and `GOOGLE_SSDI_CALENDAR_ID` (firm-wide shared calendar).
 *
 * Used by `caseCalendarSync.ts`. Callers pass already-shaped CalEvent objects from
 * `calendarService.ts`; this module turns them into Google Calendar bodies.
 */

import type { CalEvent } from "@/integrations/zoho/calendarService";

const GATEWAY_BASE = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

interface GoogleEventBody {
  summary: string;
  description?: string;
  location?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
}

/** Add 1h to an ISO timestamp; for all-day, add 1 day. */
function addHourIso(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() + 60 * 60 * 1000).toISOString();
}
function addDayDate(ymd: string): string {
  const d = new Date(ymd + "T00:00:00Z");
  return new Date(d.getTime() + 86_400_000).toISOString().slice(0, 10);
}

export function toGoogle(event: CalEvent): GoogleEventBody {
  const body: GoogleEventBody = {
    summary: event.title,
    description: event.description,
    location: event.location,
    start: {},
    end: {},
  };
  if (event.allDay) {
    body.start.date = event.start;
    body.end.date = event.end ?? addDayDate(event.start);
  } else {
    body.start.dateTime = event.start;
    body.end.dateTime = event.end ?? addHourIso(event.start);
  }
  return body;
}

function requireSecrets(): { lov: string; conn: string } {
  const lov = process.env.LOVABLE_API_KEY;
  const conn = process.env.GOOGLE_CALENDAR_API_KEY;
  if (!lov || !conn) {
    throw new Error("Google Calendar connector not configured (LOVABLE_API_KEY / GOOGLE_CALENDAR_API_KEY).");
  }
  return { lov, conn };
}

function requireCalendarId(): string {
  const id = process.env.GOOGLE_SSDI_CALENDAR_ID;
  if (!id) throw new Error("GOOGLE_SSDI_CALENDAR_ID is not set. Add the shared firm calendar id as a project secret.");
  return id;
}

async function gcalFetch(path: string, init: RequestInit): Promise<unknown> {
  const { lov, conn } = requireSecrets();
  const res = await fetch(`${GATEWAY_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lov}`,
      "X-Connection-Api-Key": conn,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Calendar gateway ${res.status}: ${text || res.statusText}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export interface GcalClient {
  calendarId: string;
  insert(event: CalEvent): Promise<string>;
  update(eventId: string, event: CalEvent): Promise<void>;
  delete(eventId: string): Promise<void>;
}

export function makeGcalClient(): GcalClient {
  const calendarId = requireCalendarId();
  const cidEnc = encodeURIComponent(calendarId);
  return {
    calendarId,
    async insert(event) {
      const json = (await gcalFetch(`/calendars/${cidEnc}/events`, {
        method: "POST",
        body: JSON.stringify(toGoogle(event)),
      })) as { id?: string } | null;
      if (!json?.id) throw new Error("Google Calendar insert did not return an event id.");
      return json.id;
    },
    async update(eventId, event) {
      await gcalFetch(`/calendars/${cidEnc}/events/${encodeURIComponent(eventId)}`, {
        method: "PUT",
        body: JSON.stringify(toGoogle(event)),
      });
    },
    async delete(eventId) {
      try {
        await gcalFetch(`/calendars/${cidEnc}/events/${encodeURIComponent(eventId)}`, {
          method: "DELETE",
        });
      } catch (e) {
        // 404/410 — already gone. Treat as success so the link row gets cleared.
        const msg = e instanceof Error ? e.message : String(e);
        if (/\b(404|410)\b/.test(msg)) return;
        throw e;
      }
    },
  };
}
