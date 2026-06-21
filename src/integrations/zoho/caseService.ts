/**
 * caseService.ts — orchestration glue (Gator Law SSDI)
 *
 * Ties the pure engines (lifecycle/deadlines) to Zoho via the per-user client.
 *   - advanceStage(userKey, caseId, toStage, {fields}) — validates the move, captures the
 *     data the new stage needs, computes the appeal deadline, writes the case, fires the
 *     stage hooks (tasks now; sign/calendar via injected deps), AS the acting user.
 *   - runDailyDeadlineSweep() — SERVICE job: refreshes Days_To_Deadline / Deadline_At_Risk /
 *     Release_Expiration_Date / Release_Expiring_Soon for every open case (today changes daily).
 *
 * Field API names match the confirmed contract (SSDI_Cases, Tasks).
 */

import { TRANSITIONS, canTransition, HOOKS, type Stage, type DueRule } from "./lifecycle";
import { computeAppealDeadline, daysUntil, isAtRisk, localToday, releaseExpiration, releaseExpiringSoon, asUTCDate } from "./deadlines";
import type { ZohoClient, ZohoRecord } from "./zohoClient";
import { SERVICE_ACTOR } from "./zohoClient";

const MODULE = "SSDI_Cases";
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Optional integrations the runner can inject (wired later). */
export interface CaseServiceDeps {
  zoho: ZohoClient;
  /** Send Zoho Sign packets (e.g. ["SSA-1696","SSA-827","Retainer"]). */
  sign?: (userKey: string, caseId: string, templates: string[]) => Promise<void>;
  /** Create Google Calendar events. */
  calendar?: (userKey: string, caseId: string, events: Array<{ label: string; on: string }>) => Promise<void>;
  /** Override "today" for testing. */
  now?: () => Date;
}

/** Fields advanceStage needs to read to compute deadlines + resolve hook due-dates. */
const READ_FIELDS = [
  "Current_Stage", "Notice_Date", "Documented_Receipt_Date", "Date_Opened",
  "ALJ_Hearing_Scheduled_Date", "Notice_of_Award_Date", "Release_Signed_Date",
];

export function createCaseService(deps: CaseServiceDeps) {
  const today = () => (deps.now ? deps.now() : localToday());

  /** Resolve a hook's DueRule against the (merged) case fields + computed deadline. */
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

  async function advanceStage(
    userKey: string,
    caseId: string,
    toStage: Stage,
    opts?: { fields?: Record<string, unknown> },
  ) {
    const api = deps.zoho.as(userKey);
    const c = await api.getRecord<ZohoRecord>(MODULE, caseId, READ_FIELDS);
    if (!c) throw new Error(`SSDI case ${caseId} not found`);

    const from = c.Current_Stage as Stage;
    if (!canTransition(from, toStage)) {
      throw new Error(`Invalid transition: "${from}" → "${toStage}". Allowed: ${TRANSITIONS[from]?.join(", ")}`);
    }

    // merge any data captured in the transition modal (e.g. the decision/notice date)
    const merged = { ...c, ...(opts?.fields ?? {}) };
    const effects = HOOKS[toStage];

    const update: ZohoRecord = { id: caseId, Current_Stage: toStage, ...(opts?.fields ?? {}) };

    // 1) deadline
    let deadline: Date | null = null;
    if (effects?.setDeadline) {
      const notice = merged.Notice_Date as string | undefined;
      if (!notice) throw new Error(`Stage "${toStage}" needs Notice_Date to compute the appeal deadline.`);
      deadline = computeAppealDeadline(notice, (merged.Documented_Receipt_Date as string) ?? null);
      update.Active_Deadline_Type = effects.setDeadline.tier;
      update.Deadline_Date = iso(deadline);
      update.Days_To_Deadline = daysUntil(deadline, today());
      update.Deadline_At_Risk = isAtRisk(deadline, 14, today());
    }

    await api.updateRecords(MODULE, [update]);

    // 2) tasks (related to the case, owned by the acting user)
    if (effects?.tasks?.length) {
      const tasks = effects.tasks.map((t) => ({
        Subject: t.label,
        Due_Date: resolveDate(t.due, { deadline, fields: merged }),
        What_Id: { id: caseId },
        $se_module: MODULE,
      })).filter((t) => t.Due_Date);
      if (tasks.length) await api.createRecords("Tasks", tasks);
    }

    // 3) injected integrations
    if (effects?.sign?.length && deps.sign) await deps.sign(userKey, caseId, effects.sign);
    if (effects?.calendar?.length && deps.calendar) {
      const events = effects.calendar
        .map((e) => ({ label: e.label, on: resolveDate(e.on, { deadline, fields: merged }) }))
        .filter((e): e is { label: string; on: string } => !!e.on);
      if (events.length) await deps.calendar(userKey, caseId, events);
    }

    return { from, to: toStage, deadline: deadline ? iso(deadline) : null };
  }

  /**
   * Re-derive Deadline_Date / Days_To_Deadline / Deadline_At_Risk from the case's
   * CURRENT Notice_Date (and optional Documented_Receipt_Date). Staff click this
   * after editing a notice date. No-ops cleanly if no appeal tier is active.
   */
  async function recomputeDeadline(userKey: string, caseId: string) {
    const api = deps.zoho.as(userKey);
    const c = await api.getRecord<ZohoRecord>(MODULE, caseId, [
      "Notice_Date", "Documented_Receipt_Date", "Active_Deadline_Type",
      "Deadline_Date", "Days_To_Deadline", "Deadline_At_Risk",
    ]);
    if (!c) throw new Error(`SSDI case ${caseId} not found`);

    const tier = c.Active_Deadline_Type as string | null | undefined;
    if (!tier || tier === "None") {
      return { recomputed: false, reason: "No active appeal tier on this case." as const };
    }
    const notice = c.Notice_Date as string | undefined;
    if (!notice) {
      throw new Error("Notice_Date is required to compute the appeal deadline.");
    }

    const deadline = computeAppealDeadline(notice, (c.Documented_Receipt_Date as string) ?? null);
    const t = today();
    const update: ZohoRecord = {
      id: caseId,
      Deadline_Date: iso(deadline),
      Days_To_Deadline: daysUntil(deadline, t),
      Deadline_At_Risk: isAtRisk(deadline, 14, t),
    };
    await api.updateRecords(MODULE, [update]);
    return {
      recomputed: true,
      deadline: update.Deadline_Date as string,
      days: update.Days_To_Deadline as number,
      atRisk: update.Deadline_At_Risk as boolean,
      changed:
        update.Deadline_Date !== c.Deadline_Date ||
        update.Days_To_Deadline !== c.Days_To_Deadline ||
        update.Deadline_At_Risk !== c.Deadline_At_Risk,
    };
  }

  /**
   * SERVICE cron: refresh time-sensitive derived fields for every open case.
   * ALSO re-derives Deadline_Date from Notice_Date whenever an appeal tier is
   * active, so notice-date edits self-heal overnight even without a manual
   * Recompute click.
   */
  async function runDailyDeadlineSweep(): Promise<{ scanned: number; updated: number }> {
    const api = deps.zoho.as(SERVICE_ACTOR);
    const rows = await api.coql<ZohoRecord>(
      `select id, Notice_Date, Documented_Receipt_Date, Active_Deadline_Type,
              Deadline_Date, Days_To_Deadline, Deadline_At_Risk,
              Release_Signed_Date, Release_Expiration_Date, Release_Expiring_Soon
       from ${MODULE}
       where Is_Closed = false
         and (Notice_Date is not null or Deadline_Date is not null or Release_Signed_Date is not null)`,
    );

    const t = today();
    const updates: ZohoRecord[] = [];
    for (const r of rows) {
      const u: ZohoRecord = { id: r.id as string };
      let changed = false;

      // 1) Re-derive Deadline_Date from Notice_Date when an appeal tier is active.
      const tier = r.Active_Deadline_Type as string | null | undefined;
      const notice = r.Notice_Date as string | null | undefined;
      let deadlineStr = r.Deadline_Date as string | null | undefined;
      if (tier && tier !== "None" && notice) {
        const d = iso(computeAppealDeadline(notice, (r.Documented_Receipt_Date as string) ?? null));
        if (d !== deadlineStr) { u.Deadline_Date = d; deadlineStr = d; changed = true; }
      }

      // 2) Days / at-risk against the (possibly refreshed) Deadline_Date.
      if (deadlineStr) {
        const days = daysUntil(deadlineStr, t);
        const risk = isAtRisk(deadlineStr, 14, t);
        if (days !== r.Days_To_Deadline) { u.Days_To_Deadline = days; changed = true; }
        if (risk !== r.Deadline_At_Risk) { u.Deadline_At_Risk = risk; changed = true; }
      }

      // 3) HIPAA release expiration + expiring-soon flag.
      if (r.Release_Signed_Date) {
        const exp = iso(releaseExpiration(r.Release_Signed_Date as string));
        const soon = releaseExpiringSoon(r.Release_Signed_Date as string, 30, t);
        if (exp !== r.Release_Expiration_Date) { u.Release_Expiration_Date = exp; changed = true; }
        if (soon !== r.Release_Expiring_Soon) { u.Release_Expiring_Soon = soon; changed = true; }
      }
      if (changed) updates.push(u);
    }

    if (updates.length) await api.updateRecords(MODULE, updates);
    return { scanned: rows.length, updated: updates.length };
  }

  return { advanceStage, recomputeDeadline, runDailyDeadlineSweep };
}
