/**
 * intakeService.ts — new-client intake (Gator Law SSDI)
 *
 *   - runConflictCheck(userKey, {lastName, email}) — searches Contacts for prior representation;
 *     returns { status: "Cleared" | "Conflict found", matches }.
 *   - createIntake(userKey, payload) — creates Client (Contact) + Engagement (type=SSDI) +
 *     first SSDI Case, linked, AS the acting user. Records the conflict result on the Engagement.
 *
 * Field API names per the confirmed contract. All writes are per-user (native attribution).
 */
import { localToday } from "./deadlines";
import type { ZohoClient, ZohoRecord } from "./zohoClient";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Escape a single quote for a COQL string literal (double it). */
const esc = (s: string) => s.replace(/'/g, "''");

/** Drop undefined/empty keys so we never send blank values to Zoho. */
const clean = (o: Record<string, unknown>): ZohoRecord =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "")) as ZohoRecord;

/** Zoho create/update returns [{ code, details:{ id } }]; pull the id. */
const idOf = (r: unknown): string => (r as { details?: { id?: string } })?.details?.id ?? "";

export interface IntakePayload {
  /** If converting an existing Contact (e.g. a Lead already became a Contact), pass its id. */
  clientId?: string;
  client: {
    firstName: string; lastName: string; email?: string; mobile?: string; homePhone?: string;
    dob?: string; ssn?: string; referralSourceId?: string; leadSource?: string;
    mailingStreet?: string; mailingCity?: string; mailingState?: string; mailingZip?: string;
  };
  conflict: { status: "Cleared" | "Conflict found"; note?: string };
  ssdi: {
    claimType?: "DIB (Title II)" | "SSI (Title XVI)" | "Concurrent";
    onset?: string; lastWorked?: string; dli?: string;
    disabilityType?: "Physical" | "Mental" | "Both";
    primaryImpairment?: string; secondaryImpairments?: string; ssaClaimNumber?: string;
  };
  /** The acting staff member's Zoho user id (from the connect flow), for Conflict_Check_By + Assigned_Case_Manager. */
  actorZohoUserId?: string;
}

export interface ConflictMatch { id: string; First_Name?: string; Last_Name?: string; Email?: string; }

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

  /** Create Client + Engagement + first SSDI Case (linked). Returns the three ids. */
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

    // 2) Engagement (type = SSDI) — records the conflict result
    const engRes = await api.createRecords("Engagements", [clean({
      Name: `${p.client.lastName}, ${p.client.firstName} — SSDI`,
      Client: { id: clientId }, Engagement_Type: "SSDI", Engagement_Status: "Open",
      Open_Date: t, Retainer_Status: "Not sent",
      Conflict_Check_Status: p.conflict.status, Conflict_Check_Date: t, Conflict_Check_By: actor,
    })]);
    const engagementId = idOf(engRes[0]);

    // 3) First SSDI Case
    const caseRes = await api.createRecords("SSDI_Cases", [clean({
      Engagement: { id: engagementId }, Current_Stage: "Intake", Date_Opened: t,
      Claim_Type: p.ssdi.claimType, Alleged_Onset_Date: p.ssdi.onset,
      Date_Last_Worked: p.ssdi.lastWorked, Date_Last_Insured: p.ssdi.dli,
      Disability_Type: p.ssdi.disabilityType, Primary_Impairment: p.ssdi.primaryImpairment,
      Secondary_Impairments: p.ssdi.secondaryImpairments, SSA_Claim_Number: p.ssdi.ssaClaimNumber,
      Assigned_Case_Manager: actor,
    })]);
    const caseId = idOf(caseRes[0]);

    return { clientId, engagementId, caseId };
  }



  /**
   * Convert a Zoho Lead into Client + SSDI Engagement + first SSDI Case (linked) and
   * stamp the Lead with Lead_Status="Converted" + Converted_Contact. Only SSDI is wired
   * today; other practice areas throw a clear "coming soon" message.
   */
  async function convertLead(userKey: string, leadId: string) {
    const api = deps.zoho.as(userKey);
    const lead = await api.getRecord<ZohoRecord>("Leads", leadId);
    if (!lead) throw new Error(`Lead ${leadId} not found`);

    const practice = (lead.Practice_Area as string | undefined) ?? "";
    if (practice !== "SSDI") {
      throw new Error(
        `only SSDI conversion is built today; coming for ${practice || "this practice"}`,
      );
    }
    if (lead.Converted_Contact) throw new Error("lead is already converted");

    const lastName = (lead.Last_Name as string | undefined)?.trim();
    if (!lastName) throw new Error("lead has no last name; cannot convert");
    const firstName = ((lead.First_Name as string | undefined) ?? "").trim();
    const email = lead.Email as string | undefined;

    // Conflict check on existing Contacts (Last_Name or Email).
    const clauses: string[] = [];
    if (lastName) clauses.push(`Last_Name = '${esc(lastName)}'`);
    if (email) clauses.push(`Email = '${esc(email)}'`);
    const matches = clauses.length
      ? await api.coql<ConflictMatch>(
          `select id, First_Name, Last_Name, Email from Contacts where ${clauses.join(" or ")}`,
        )
      : [];
    const conflict = {
      status: (matches.length ? "Conflict found" : "Cleared") as "Cleared" | "Conflict found",
      matches,
    };
    const t = today();
    const actor = undefined as { id: string } | undefined; // optional

    // Client (Contact)
    const cRes = await api.createRecords("Contacts", [clean({
      First_Name: firstName, Last_Name: lastName,
      Email: email, Mobile: lead.Mobile, Home_Phone: lead.Phone,
      Contact_Type: "Client", Lead_Source: lead.Lead_Source,
      Mailing_Street: lead.Street, Mailing_City: lead.City,
      Mailing_State: lead.State, Mailing_Zip: lead.Zip_Code,
    })]);
    const clientId = idOf(cRes[0]);

    // Engagement (SSDI)
    const engRes = await api.createRecords("Engagements", [clean({
      Name: `${lastName}, ${firstName || ""} — SSDI`.replace(/, —/, " —"),
      Client: { id: clientId }, Engagement_Type: "SSDI", Engagement_Status: "Open",
      Open_Date: t, Retainer_Status: "Not sent",
      Conflict_Check_Status: conflict.status, Conflict_Check_Date: t, Conflict_Check_By: actor,
    })]);
    const engagementId = idOf(engRes[0]);

    // First SSDI Case
    const caseRes = await api.createRecords("SSDI_Cases", [clean({
      Engagement: { id: engagementId }, Current_Stage: "Intake", Date_Opened: t,
      Assigned_Case_Manager: actor,
    })]);
    const caseId = idOf(caseRes[0]);

    // Stamp the Lead
    await api.updateRecords("Leads", [{
      id: leadId,
      Lead_Status: "Converted",
      Converted_Contact: { id: clientId },
    }]);

    return { clientId, engagementId, caseId, leadId, conflict };
  }

  return { runConflictCheck, createIntake, convertLead };
}
