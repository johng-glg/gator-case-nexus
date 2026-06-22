/**
 * intakeService.ts — new-client intake, lead conversion, and case-on-retainer-signed (Gator Law)
 *
 *   - runConflictCheck(userKey, {lastName, email}) — searches Contacts for prior representation.
 *   - createIntake(userKey, payload) — creates Client (Contact) + Engagement (type=SSDI), linked,
 *     AS the acting user, recording the conflict result on the Engagement. **No case yet** — a case
 *     is only opened once the retainer is signed (see createSsdiCaseOpener).
 *   - convertLead(userKey, leadId) — the standard funnel: take a qualified Lead from the shared,
 *     practice-tagged pipeline → conflict check → createIntake → stamp the Lead Converted + link the
 *     new Contact. Retainer is then sent from the resulting Engagement.
 *   - createSsdiCaseOpener(zoho) — returns the onRetainerSigned handler for retainerService: when an
 *     SSDI engagement's retainer is signed, open the first SSDI Case (stage Intake) if none exists.
 *
 * Field API names per the confirmed contract. User writes are per-user (native attribution);
 * the case-opener runs as SERVICE (it fires from the Sign webhook, which has no user session).
 */

import { localToday } from "./deadlines";
import type { ZohoClient, ZohoRecord } from "./zohoClient";
import { SERVICE_ACTOR } from "./zohoClient";

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Escape a single quote for a COQL string literal (double it). */
const esc = (s: string) => s.replace(/'/g, "''");
/** Drop undefined/empty keys so we never send blank values to Zoho. */
const clean = (o: Record<string, unknown>): ZohoRecord =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "")) as ZohoRecord;
/** Zoho create/update returns [{ code, details:{ id } }]; pull the id. */
const idOf = (r: unknown): string => (r as { details?: { id?: string } })?.details?.id ?? "";
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const lookupId = (v: unknown): string | undefined =>
  typeof v === "string" ? v : (v as { id?: string })?.id;

export interface IntakePayload {
  /** If converting an existing Contact (e.g. a Lead already became a Contact), pass its id. */
  clientId?: string;
  client: {
    firstName: string; lastName: string; email?: string; mobile?: string; homePhone?: string;
    dob?: string; ssn?: string; referralSourceId?: string; leadSource?: string;
    mailingStreet?: string; mailingCity?: string; mailingState?: string; mailingZip?: string;
  };
  conflict: { status: "Cleared" | "Conflict found"; note?: string };
  /** The acting staff member's Zoho user id (from the connect flow), for Conflict_Check_By. */
  actorZohoUserId?: string;
}

export interface ConflictMatch { id: string; First_Name?: string; Last_Name?: string; Email?: string; }

/** Practices that can convert today. Others are queued until their module is built. */
const BUILT_PRACTICES = new Set(["SSDI"]);

export function createIntakeService(deps: { zoho: ZohoClient; now?: () => Date }) {
  const today = () => iso(deps.now ? deps.now() : localToday());

  /** Search existing Contacts by last name / email — surfaces prior representation to review. */
  async function runConflictCheck(
    userKey: string,
    q: { lastName?: string; email?: string },
  ): Promise<{ status: "Cleared" | "Conflict found"; matches: ConflictMatch[] }> {
    const clauses: string[] = [];
    if (q.lastName) clauses.push(`Last_Name = '${esc(q.lastName)}'`);
    if (q.email) clauses.push(`Email = '${esc(q.email)}'`);
    if (!clauses.length) return { status: "Cleared", matches: [] };
    const matches = await deps.zoho.as(userKey).coql<ConflictMatch>(
      `select id, First_Name, Last_Name, Email from Contacts where ${clauses.join(" or ")}`,
    );
    return { status: matches.length ? "Conflict found" : "Cleared", matches };
  }

  /** Create Client + Engagement (NO case — that waits for a signed retainer). Returns the two ids. */
  async function createIntake(userKey: string, p: IntakePayload) {
    const api = deps.zoho.as(userKey);
    const t = today();
    const actor = p.actorZohoUserId ? { id: p.actorZohoUserId } : undefined;

    // 1) Client (Contact) — reuse an existing one if provided
    let clientId = p.clientId;
    if (!clientId) {
      const res = await api.createRecords("Contacts", [clean({
        First_Name: p.client.firstName, Last_Name: p.client.lastName,
        Email: p.client.email, Mobile: p.client.mobile, Home_Phone: p.client.homePhone,
        DOB: p.client.dob, SSN: p.client.ssn, Contact_Type: "Client",
        Lead_Source: p.client.leadSource,
        Referral_Source: p.client.referralSourceId ? { id: p.client.referralSourceId } : undefined,
        Mailing_Street: p.client.mailingStreet, Mailing_City: p.client.mailingCity,
        Mailing_State: p.client.mailingState, Mailing_Zip: p.client.mailingZip,
      })]);
      clientId = idOf(res[0]);
    }

    // 2) Engagement (type = SSDI) — records the conflict result; retainer starts "Not sent"
    const engRes = await api.createRecords("Engagements", [clean({
      Name: `${p.client.lastName}, ${p.client.firstName} — SSDI`,
      Client: { id: clientId }, Engagement_Type: "SSDI", Engagement_Status: "Open",
      Open_Date: t, Retainer_Status: "Not sent",
      Conflict_Check_Status: p.conflict.status, Conflict_Check_Date: t, Conflict_Check_By: actor,
    })]);
    const engagementId = idOf(engRes[0]);

    return { clientId, engagementId };
  }

  const LEAD_FIELDS = [
    "First_Name", "Last_Name", "Email", "Mobile", "Phone", "Lead_Source", "Practice_Area",
    "Street", "City", "State", "Zip_Code", "Lead_Status", "Converted_Contact", "Lead_Tier",
  ];

  /**
   * Convert a qualified Lead into Client + Engagement and mark it Converted. The case is opened
   * later, when the retainer is signed. Shared Leads pipeline is tagged by Practice_Area; only
   * built practices convert today.
   *
   * Gated by Lead_Tier: a Decline cannot convert unless `override.reason` is supplied (the caller
   * is responsible for logging the override into case_activity_log).
   */
  async function convertLead(userKey: string, leadId: string, opts?: { override?: { reason: string } }) {
    const api = deps.zoho.as(userKey);
    const lead = await api.getRecord<ZohoRecord>("Leads", leadId, LEAD_FIELDS);
    if (!lead) throw new Error(`Lead ${leadId} not found`);
    if (lead.Converted_Contact) throw new Error(`Lead ${leadId} is already converted.`);

    const tier = str(lead.Lead_Tier);
    if (tier === "Decline" && !opts?.override?.reason) {
      throw new Error("Lead screened as Decline. Provide an attorney override reason to convert.");
    }

    const practice = str(lead.Practice_Area) ?? "SSDI";
    if (!BUILT_PRACTICES.has(practice)) {
      throw new Error(`Lead ${leadId} is a ${practice} lead; only SSDI conversion is built today.`);
    }

    const lastName = str(lead.Last_Name);
    const firstName = str(lead.First_Name) ?? "";
    if (!lastName) throw new Error(`Lead ${leadId} has no last name; cannot convert.`);

    const conflict = await runConflictCheck(userKey, { lastName, email: str(lead.Email) });

    const result = await createIntake(userKey, {
      client: {
        firstName, lastName,
        email: str(lead.Email), mobile: str(lead.Mobile), homePhone: str(lead.Phone),
        leadSource: str(lead.Lead_Source),
        mailingStreet: str(lead.Street), mailingCity: str(lead.City),
        mailingState: str(lead.State), mailingZip: str(lead.Zip_Code),
      },
      conflict: { status: conflict.status },
    });

    await api.updateRecords("Leads", [{
      id: leadId, Lead_Status: "Converted", Converted_Contact: { id: result.clientId },
    }]);

    return { ...result, leadId, conflict, override: opts?.override ?? null };
  }


  return { runConflictCheck, createIntake, convertLead };
}

/**
 * Returns the onRetainerSigned handler for retainerService: when an SSDI engagement's retainer is
 * signed, open the first SSDI Case at stage "Retained" (assigned to the engagement owner). Idempotent
 * — won't open a second case if one already exists. Runs as SERVICE (webhook has no user session).
 */
export function createSsdiCaseOpener(zoho: ZohoClient, opts?: { now?: () => Date }) {
  const today = () => iso(opts?.now ? opts.now() : localToday());
  return async ({ engagementId }: { engagementId: string }): Promise<{ caseId?: string }> => {
    const api = zoho.as(SERVICE_ACTOR);
    const eng = await api.getRecord<ZohoRecord>("Engagements", engagementId, ["Name", "Engagement_Type", "Owner", "Client"]);
    if (!eng || eng.Engagement_Type !== "SSDI") return {}; // only SSDI opens an SSDI case

    const existing = await api.coql<ZohoRecord>(
      `select id from SSDI_Cases where Engagement = ${engagementId}`, // lookup filter = bare id
    );
    if (existing.length) return { caseId: existing[0].id as string }; // already opened → no-op

    const ownerId = lookupId(eng.Owner);
    const clientId = lookupId(eng.Client);
    const res = await api.createRecords("SSDI_Cases", [clean({
      Name: (eng.Name as string) ?? `SSDI Case ${engagementId}`,
      Engagement: { id: engagementId },
      Client: clientId ? { id: clientId } : undefined,
      Current_Stage: "Retained",
      Date_Opened: today(),
      Assigned_Case_Manager: ownerId ? { id: ownerId } : undefined,
    })]);
    return { caseId: idOf(res[0]) };
  };
  };
}
