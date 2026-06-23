/**
 * caseService.ts — orchestration glue (Gator Law SSDI)
 *
 * Ties the pure engines (lifecycle/deadlines) to Zoho via the per-user client.
 *   - advanceStage(userKey, caseId, toStage, {fields}) — validates the move, captures the
 *     data the new stage needs, computes the appeal deadline, writes the case, fires hooks.
 *   - recomputeDeadline(userKey, caseId) — re-derives Deadline_Date/Days/At_Risk from the
 *     case's CURRENT Notice_Date (self-heals a manual notice-date edit). For a button.
 *   - runDailyDeadlineSweep() — SERVICE cron: for every open case it re-derives the deadline
 *     from Notice_Date (so edits self-heal) and refreshes the day counts + release flags.
 *
 * Field API names match the confirmed contract (SSDI_Cases, Tasks).
 */

import { TRANSITIONS, canTransition, HOOKS, normalizeStage, missingRequiredFieldsDetailed, STAGE_SLA_DAYS, type Stage, type DueRule, type MissingField } from "./lifecycle";
import { computeAppealDeadline, daysUntil, isAtRisk, releaseExpiration, releaseExpiringSoon, asUTCDate, localToday } from "./deadlines";
import type { ZohoClient, ZohoRecord } from "./zohoClient";
import { SERVICE_ACTOR } from "./zohoClient";

const MODULE = "SSDI_Cases";
const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface CaseServiceDeps {
  zoho: ZohoClient;
  sign?: (userKey: string, caseId: string, templates: string[]) => Promise<void>;
  calendar?: (userKey: string, caseId: string, events: Array<{ label: string; on: string }>) => Promise<void>;
  now?: () => Date;
}

/** Thrown when a stage advance is missing required data. `missing` is structured for the UI. */
export class RequiredFieldsError extends Error {
  readonly missing: MissingField[];
  constructor(readonly stage: string, missing: MissingField[]) {
    super(`Stage "${stage}" requires: ${missing.map((m) => m.label).join(", ")}.`);
    this.name = "RequiredFieldsError";
    this.missing = missing;
  }
}


const READ_FIELDS = [
  "Current_Stage", "Notice_Date", "Documented_Receipt_Date", "Date_Opened",
  "ALJ_Hearing_Scheduled_Date", "Notice_of_Award_Date", "Release_Signed_Date",
  "Assigned_Attorney",
];

/** Fields the sweep/recompute read to re-derive the deadline + counts. */
const DERIVE_FIELDS = [
  "id", "Case_Number", "Active_Deadline_Type", "Notice_Date", "Documented_Receipt_Date",
  "Deadline_Date", "Days_To_Deadline", "Deadline_At_Risk",
  "Release_Signed_Date", "Release_Expiring_Soon", "Assigned_Attorney", "Engagement",
];

export function createCaseService(deps: CaseServiceDeps) {
  const today = () => (deps.now ? deps.now() : localToday());

  function resolveDate(rule: DueRule, ctx: { deadline: Date | null; fields: Record<string, unknown> }): string | null {
    const fieldDate = (f: string): Date | null => {
      const v = ctx.fields[f];
      return typeof v === "string" && v ? asUTCDate(v) : null;
    };
    let base: Date | null = null;
    let delta = 0;
    if (rule.type === "deadlineMinus") { base = ctx.deadline; delta = -rule.days; }
    else if (rule.type === "fieldPlus") { base = fieldDate(rule.field); delta = rule.days; }
    else if (rule.type === "fieldMinus") { base = fieldDate(rule.field); delta = -rule.days; }
    if (!base) return null;
    return iso(new Date(base.getTime() + delta * 86_400_000));
  }

  /**
   * Compute the deadline field updates for a case record, re-deriving Deadline_Date from
   * Notice_Date whenever there's an active appeal tier (so a notice edit self-heals).
   * Returns only the fields that actually changed.
   */
  function deadlineFieldUpdates(r: ZohoRecord, t: Date): ZohoRecord {
    const u: ZohoRecord = {};
    const tier = r.Active_Deadline_Type as string | undefined;
    const notice = r.Notice_Date as string | undefined;
    let deadlineISO: string | null = null;
    if (tier && tier !== "None" && notice) {
      deadlineISO = iso(computeAppealDeadline(notice, (r.Documented_Receipt_Date as string) ?? null));
      if (deadlineISO !== r.Deadline_Date) u.Deadline_Date = deadlineISO; // self-heal notice edits
    } else if (r.Deadline_Date) {
      deadlineISO = r.Deadline_Date as string; // no tier/notice → keep stored, just re-count
    }
    if (deadlineISO) {
      const days = daysUntil(deadlineISO, t);
      const risk = isAtRisk(deadlineISO, 14, t);
      if (days !== r.Days_To_Deadline) u.Days_To_Deadline = days;
      if (risk !== r.Deadline_At_Risk) u.Deadline_At_Risk = risk;
    }
    return u;
  }

  async function advanceStage(
    userKey: string,
    caseId: string,
    toStage: Stage,
    opts?: { fields?: Record<string, unknown> },
  ) {
    const api = deps.zoho.as(userKey);
    const c = await api.getRecord<ZohoRecord>(MODULE, caseId, READ_FIELDS);
    if (!c) throw new Error(`SSDI case ${caseId} not found`);

    const from = normalizeStage(c.Current_Stage as string | undefined);
    if (!canTransition(from, toStage)) {
      throw new Error(`Invalid transition: "${from}" → "${toStage}". Allowed: ${TRANSITIONS[from]?.join(", ")}`);
    }

    const merged = { ...c, ...(opts?.fields ?? {}) };

    // Stage-gate: block the move when a field the new stage requires is missing.
    const missing = missingRequiredFieldsDetailed(toStage, merged);
    if (missing.length) throw new RequiredFieldsError(toStage, missing);

    const effects = HOOKS[toStage];
    const update: ZohoRecord = { id: caseId, Current_Stage: toStage, ...(opts?.fields ?? {}) };

    let deadline: Date | null = null;
    if (effects?.setDeadline) {
      const notice = merged.Notice_Date as string | undefined;
      if (!notice) throw new Error(`Stage "${toStage}" needs Notice_Date to compute the appeal deadline.`);
      deadline = computeAppealDeadline(notice, (merged.Documented_Receipt_Date as string) ?? null);
      update.Active_Deadline_Type = effects.setDeadline.tier;
      update.Deadline_Date = iso(deadline);
      update.Days_To_Deadline = daysUntil(deadline, today());
      update.Deadline_At_Risk = isAtRisk(deadline, 14, today());
    } else if (effects?.clearDeadline) {
      // Appeal filed (deadline met) or case won — retire the pending clock.
      update.Active_Deadline_Type = "None";
      update.Deadline_Date = null;
      update.Days_To_Deadline = null;
      update.Deadline_At_Risk = false;
    }

    await api.updateRecords(MODULE, [update]);

    if (effects?.tasks?.length) {
      // Lookup field on SSDI_Cases. Zoho returns either an object {id,name} or a bare id.
      const aa = merged.Assigned_Attorney as { id?: string } | string | undefined;
      const attorneyId = typeof aa === "string" ? aa : aa?.id;
      const tasks = effects.tasks.map((t) => {
        const task: ZohoRecord = {
          Subject: t.label,
          Due_Date: resolveDate(t.due, { deadline, fields: merged }),
          What_Id: { id: caseId },
          $se_module: MODULE,
          Status: "Not Started",
          Priority: "High",
        };
        if (attorneyId) task.Owner = { id: attorneyId };
        return task;
      }).filter((t) => t.Due_Date);
      if (tasks.length) await api.createRecords("Tasks", tasks);
    }

    if (effects?.sign?.length && deps.sign) await deps.sign(userKey, caseId, effects.sign);
    if (effects?.calendar?.length && deps.calendar) {
      const events = effects.calendar
        .map((e) => ({ label: e.label, on: resolveDate(e.on, { deadline, fields: merged }) }))
        .filter((e): e is { label: string; on: string } => !!e.on);
      if (events.length) await deps.calendar(userKey, caseId, events);
    }

    return { from, to: toStage, deadline: deadline ? iso(deadline) : null };
  }

  /** Re-derive a single case's deadline from its current Notice_Date. For a "Recompute" button. */
  async function recomputeDeadline(userKey: string, caseId: string) {
    const api = deps.zoho.as(userKey);
    const r = await api.getRecord<ZohoRecord>(MODULE, caseId, DERIVE_FIELDS.slice(1));
    if (!r) throw new Error(`SSDI case ${caseId} not found`);
    const u = deadlineFieldUpdates({ ...r, id: caseId }, today());
    if (Object.keys(u).length) await api.updateRecords(MODULE, [{ id: caseId, ...u }]);
    return { id: caseId, ...u };
  }

  /** SERVICE cron: re-derive deadlines + return a digest of overdue / due-soon / release-expiring cases. */
  async function runDailyDeadlineSweep(): Promise<{
    scanned: number;
    updated: number;
    overdue: DigestRow[];
    dueSoon: DigestRow[];
    releaseExpiring: DigestRow[];
  }> {
    const api = deps.zoho.as(SERVICE_ACTOR);
    const rows = await api.coql<ZohoRecord>(
      `select ${DERIVE_FIELDS.join(", ")}
       from ${MODULE}
       where ((Is_Closed = false) and (((Notice_Date is not null) or (Deadline_Date is not null)) or (Release_Signed_Date is not null)))`,
    );

    const t = today();
    const updates: ZohoRecord[] = [];
    const overdue: DigestRow[] = [];
    const dueSoon: DigestRow[] = [];
    const releaseExpiring: DigestRow[] = [];

    for (const r of rows) {
      const u = deadlineFieldUpdates(r, t);
      if (r.Release_Signed_Date) {
        const exp = iso(releaseExpiration(r.Release_Signed_Date as string));
        const soon = releaseExpiringSoon(r.Release_Signed_Date as string, 30, t);
        u.Release_Expiration_Date = exp;
        if (soon !== r.Release_Expiring_Soon) u.Release_Expiring_Soon = soon;
        if (soon) releaseExpiring.push(toDigestRow(r, { kind: "release", date: exp }));
      }
      if (Object.keys(u).length) updates.push({ id: r.id as string, ...u });

      const dl = (u.Deadline_Date ?? r.Deadline_Date) as string | undefined;
      const days = typeof u.Days_To_Deadline === "number" ? u.Days_To_Deadline
        : typeof r.Days_To_Deadline === "number" ? r.Days_To_Deadline as number
        : null;
      if (dl && typeof days === "number") {
        if (days < 0) overdue.push(toDigestRow(r, { kind: "overdue", date: dl, days }));
        else if (days <= 7) dueSoon.push(toDigestRow(r, { kind: "due_soon", date: dl, days }));
      }
    }

    if (updates.length) await api.updateRecords(MODULE, updates);
    overdue.sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
    dueSoon.sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
    return { scanned: rows.length, updated: updates.length, overdue, dueSoon, releaseExpiring };
  }

  return { advanceStage, recomputeDeadline, runDailyDeadlineSweep };
}

export interface DigestRow {
  id: string;
  caseNumber: string | null;
  engagementId: string | null;
  attorneyId: string | null;
  attorneyName: string | null;
  tier: string | null;
  date: string;
  days?: number;
  kind: "overdue" | "due_soon" | "release";
}

function toDigestRow(r: ZohoRecord, x: { kind: DigestRow["kind"]; date: string; days?: number }): DigestRow {
  const aa = r.Assigned_Attorney as { id?: string; name?: string } | string | undefined;
  const eng = r.Engagement as { id?: string } | string | undefined;
  return {
    id: r.id as string,
    caseNumber: (r.Case_Number as string) ?? null,
    engagementId: typeof eng === "string" ? eng : eng?.id ?? null,
    attorneyId: typeof aa === "string" ? aa : aa?.id ?? null,
    attorneyName: typeof aa === "object" ? aa?.name ?? null : null,
    tier: (r.Active_Deadline_Type as string) ?? null,
    date: x.date,
    days: x.days,
    kind: x.kind,
  };
}
