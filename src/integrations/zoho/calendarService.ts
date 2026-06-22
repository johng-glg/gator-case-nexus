/**
 * calendarService.ts — derive Google Calendar events from an SSDI case + reconcile idempotently.
 *
 * Pure logic (no I/O): given a case record, produce the events that SHOULD exist (appeal deadline +
 * ALJ hearing), each with a stable `key`. Then reconcile(desired, existing) returns the minimal set
 * of create / update / delete actions against a stored key→{eventId, sig} map, so the nightly sweep
 * never creates duplicates and only touches events whose content actually changed.
 *
 * The app executes the returned actions via the Google connector and persists the map
 * (calendar_event_links). Same idempotency pattern as Retainer_ID for Zoho Sign.
 */

import type { ZohoRecord } from "./zohoClient";

export interface CalEvent {
  key: string;            // stable, e.g. "deadline:<caseId>" / "hearing:<caseId>"
  title: string;
  start: string;          // YYYY-MM-DD (all-day) or ISO datetime
  end?: string;
  allDay: boolean;
  location?: string;
  description?: string;
}

export type CalAction =
  | { op: "create"; key: string; event: CalEvent }
  | { op: "update"; key: string; eventId: string; event: CalEvent }
  | { op: "delete"; key: string; eventId: string };

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/** Content fingerprint — reconcile updates only when this changes (skips no-op writes). */
export function signature(e: CalEvent): string {
  return [e.title, e.start, e.end ?? "", e.allDay ? "1" : "0", e.location ?? ""].join("|");
}

/**
 * Events that SHOULD exist for a case. Closed cases (and cases missing the underlying date) yield
 * none — so reconcile will delete any stale events. caseId is the Zoho record id; label is what to
 * show (e.g. Case_Number or "Last, First").
 */
export function desiredEventsForCase(
  c: ZohoRecord & { id?: string },
  opts: { caseId: string; label: string; caseUrl?: string },
): CalEvent[] {
  if (c.Is_Closed === true) return [];
  const out: CalEvent[] = [];
  const link = opts.caseUrl ? `\n${opts.caseUrl}` : "";

  const deadline = str(c.Deadline_Date);
  const tier = str(c.Active_Deadline_Type);
  if (deadline && tier && tier !== "None") {
    out.push({
      key: `deadline:${opts.caseId}`,
      title: `SSDI ${tier} deadline — ${opts.label}`,
      start: deadline, allDay: true,
      description: `Appeal deadline (${tier}) for ${opts.label}.${link}`,
    });
  }

  const hearing = str(c.ALJ_Hearing_Scheduled_Date);
  if (hearing) {
    const office = str(c.Hearing_Office_ODAR);
    const alj = str(c.ALJ_Name);
    const allDay = hearing.length <= 10; // date-only vs datetime
    out.push({
      key: `hearing:${opts.caseId}`,
      title: `SSDI ALJ hearing — ${opts.label}`,
      start: hearing, allDay,
      location: office,
      description: [`ALJ hearing for ${opts.label}.`, alj ? `ALJ: ${alj}` : "", office ? `Office: ${office}` : ""]
        .filter(Boolean).join("\n") + link,
    });
  }

  return out;
}

/**
 * Diff desired events against the stored map. `existing` is keyed by event key.
 * - desired key not in existing            → create
 * - desired key in existing, sig changed   → update (reuse eventId)
 * - existing key no longer desired         → delete
 */
export function reconcile(
  desired: CalEvent[],
  existing: Record<string, { eventId: string; sig: string }>,
): CalAction[] {
  const actions: CalAction[] = [];
  const desiredKeys = new Set(desired.map((e) => e.key));

  for (const e of desired) {
    const prior = existing[e.key];
    if (!prior) actions.push({ op: "create", key: e.key, event: e });
    else if (prior.sig !== signature(e)) actions.push({ op: "update", key: e.key, eventId: prior.eventId, event: e });
    // else: unchanged → no action
  }
  for (const [key, v] of Object.entries(existing)) {
    if (!desiredKeys.has(key)) actions.push({ op: "delete", key, eventId: v.eventId });
  }
  return actions;
}
