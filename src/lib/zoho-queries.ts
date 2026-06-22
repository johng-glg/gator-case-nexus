/**
 * zoho-queries.ts — Whitelisted COQL templates the UI is allowed to invoke.
 *
 * The client never sends raw COQL; it sends a query name + params, and this map
 * decides what actually runs. Keeps the attack surface tiny.
 *
 * IMPORTANT: every interpolated value must be safe (id, enum, boolean) — no raw strings.
 * Identifiers we accept are Zoho record ids (alphanumeric) or known enum values.
 */
import { ALL_ENGAGEMENT_TYPES } from "@/practices/registry";

const ID = /^[A-Za-z0-9_-]+$/;

function safeId(v: unknown): string {
  if (typeof v !== "string" || !ID.test(v)) throw new Error("Invalid id parameter.");
  // COQL requires id comparisons to be single-quoted string literals.
  return `'${v}'`;
}

/** Quote a string for COQL only if it is in the provided whitelist. */
function safeEnum(v: unknown, allowed: readonly string[]): string {
  if (typeof v !== "string" || !allowed.includes(v)) {
    throw new Error("Invalid enum parameter.");
  }
  // COQL string literal: single-quoted; escape embedded single quotes.
  return `'${v.replace(/'/g, "''")}'`;
}

/** Sanitize a free-text search term for a COQL `like` clause. */
function safeLike(v: unknown): string {
  if (typeof v !== "string") throw new Error("Invalid search parameter.");
  // Allow letters, numbers, dash, underscore, dot, slash, space. Cap length to keep COQL tight.
  const cleaned = v.trim().slice(0, 40).replace(/[^A-Za-z0-9 _.\-/]/g, "");
  if (!cleaned) throw new Error("Search term is empty.");
  return `'%${cleaned}%'`;
}



export type QueryName =
  | "openCases"
  | "myOpenCases"
  | "deadlinesAtRisk"
  | "deadlinesAll"
  | "myDeadlines"
  | "upcomingHearings"
  | "releasesExpiringSoon"
  | "releasesAll"
  | "pipelineByStage"
  | "pipelineByPractice"
  | "pipelineCases"
  | "closedCases"
  | "ssdiEngagementsWithReferral"
  | "costsByEngagement"
  | "allCosts"
  | "casesByEngagement"
  | "engagementById"
  | "allEngagements"
  | "engagementsByType"
  | "myEngagements"
  | "allContacts"
  | "engagementsByContact"
  | "allLeads"
  | "allReferrals"
  | "ssdiCaseSearch"
  | "contactSearch"
  | "leadSearch"
  | "engagementSearch";



const ENGAGEMENT_COLS =
  "id, Name, Engagement_Type, Engagement_Status, Retainer_Status, Client.First_Name, Client.Last_Name";

export function buildQuery(name: QueryName, params: Record<string, unknown> = {}): string {
  switch (name) {
    case "openCases":
      return `select Case_Number, Current_Stage, Sub_Status, Deadline_Date, Days_To_Deadline, Engagement, Assigned_Case_Manager
              from SSDI_Cases
              where (Is_Closed = false or Is_Closed is null)
              order by Date_Opened desc
              limit 200`;
    case "myOpenCases":
      return `select Case_Number, Current_Stage, Sub_Status, Engagement, Deadline_Date, Days_To_Deadline
              from SSDI_Cases
              where Assigned_Case_Manager = ${safeId(params.userId)} and (Is_Closed = false or Is_Closed is null)
              order by Date_Opened desc
              limit 200`;
    case "deadlinesAtRisk":
      return `select Case_Number, Current_Stage, Active_Deadline_Type, Deadline_Date, Days_To_Deadline,
                     Engagement, Engagement.Name, Assigned_Attorney
              from SSDI_Cases
              where Deadline_At_Risk = true and Is_Closed = false
              order by Days_To_Deadline asc
              limit 200`;
    case "deadlinesAll":
      return `select Case_Number, Current_Stage, Active_Deadline_Type, Deadline_Date, Days_To_Deadline,
                     Engagement, Engagement.Name, Assigned_Attorney
              from SSDI_Cases
              where Deadline_Date is not null and Is_Closed = false
              order by Deadline_Date asc
              limit 200`;
    case "myDeadlines":
      return `select Case_Number, Current_Stage, Active_Deadline_Type, Deadline_Date, Days_To_Deadline,
                     Engagement, Engagement.Name, Assigned_Attorney
              from SSDI_Cases
              where Deadline_Date is not null and Is_Closed = false
                and Assigned_Attorney.id = ${safeId(params.userId)}
              order by Deadline_Date asc
              limit 200`;
    case "upcomingHearings":
      return `select Case_Number, ALJ_Hearing_Scheduled_Date, Hearing_Office_ODAR, ALJ_Name,
                     Engagement, Engagement.Name, Assigned_Attorney
              from SSDI_Cases
              where ALJ_Hearing_Scheduled_Date is not null and Is_Closed = false
              order by ALJ_Hearing_Scheduled_Date asc
              limit 200`;
    case "releasesExpiringSoon":
      return `select Case_Number, Release_Expiration_Date, Engagement
              from SSDI_Cases
              where Release_Expiring_Soon = true and Is_Closed = false
              order by Release_Expiration_Date asc
              limit 200`;
    case "releasesAll":
      return `select Case_Number, Release_Signed_Date, Release_Expiration_Date, Release_Expiring_Soon, Engagement
              from SSDI_Cases
              where Release_Signed_Date is not null and Is_Closed = false
              order by Release_Expiration_Date asc
              limit 200`;
    case "pipelineByStage":
      return `select Current_Stage, count(id)
              from SSDI_Cases
              where Is_Closed = false
              group by Current_Stage
              limit 200`;
    case "pipelineByPractice":
      return `select Engagement_Type, Engagement_Status
              from Engagements
              where id is not null
              order by Modified_Time desc
              limit 200`;
    case "pipelineCases":
      return `select id, Case_Number, Current_Stage, Sub_Status, Date_Opened,
                     Deadline_Date, Days_To_Deadline,
                     Assigned_Attorney, Assigned_Attorney.name,
                     Engagement, Engagement.Name,
                     Engagement.Referral_Source, Engagement.Referral_Source.Name
              from SSDI_Cases
              where Is_Closed = false
              order by Date_Opened desc
              limit 1000`;
    case "closedCases":
      return `select id, Case_Number, Current_Stage, Closure_Reason, Final_Disposition_Date,
                     Date_Opened, ALJ_Name, Hearing_Office_ODAR,
                     Primary_Impairment, Secondary_Impairments, Back_Pay_Amount,
                     Assigned_Attorney, Assigned_Attorney.name,
                     Engagement, Engagement.Name,
                     Engagement.Referral_Source, Engagement.Referral_Source.Name
              from SSDI_Cases
              where Is_Closed = true
              order by Final_Disposition_Date desc
              limit 1000`;
    case "ssdiEngagementsWithReferral":
      return `select id, Name, Engagement_Status, Open_Date,
                     Referral_Source, Referral_Source.Name
              from Engagements
              where Engagement_Type = 'SSDI'
              order by Open_Date desc
              limit 1000`;
    case "costsByEngagement":
      return `select id, Name, Amount, Cost_Type, Created_Time, Engagement
              from Costs
              where Engagement = ${safeId(params.engagementId)}
              order by Created_Time desc
              limit 200`;
    case "allCosts":
      return `select id, Name, Amount, Cost_Type, Created_Time,
                     Engagement, Engagement.Name,
                     Engagement.Client.First_Name, Engagement.Client.Last_Name
              from Costs
              where id is not null
              order by Created_Time desc
              limit 1000`;
    case "casesByEngagement":
      return `select id, Case_Number, Current_Stage, Sub_Status,
                     Deadline_Date, Days_To_Deadline, Deadline_At_Risk
              from SSDI_Cases
              where Engagement = ${safeId(params.engagementId)}
              order by Modified_Time desc
              limit 200`;
    case "engagementById":
      return `select Name, Engagement_Type, Engagement_Status, Retainer_Status,
                     Client, Client.First_Name, Client.Last_Name
              from Engagements
              where id = ${safeId(params.engagementId)}
              limit 1`;
    case "allEngagements":
      return `select ${ENGAGEMENT_COLS}
              from Engagements
              where id is not null
              order by Modified_Time desc
              limit 200`;
    case "engagementsByType":
      return `select ${ENGAGEMENT_COLS}
              from Engagements
              where Engagement_Type = ${safeEnum(params.engagementType, ALL_ENGAGEMENT_TYPES)}
              order by Modified_Time desc
              limit 200`;
    case "myEngagements":
      return `select ${ENGAGEMENT_COLS}
              from Engagements
              where Assigned_Attorney.id = ${safeId(params.userId)}
              order by Modified_Time desc
              limit 200`;
    case "allContacts":
      return `select id, First_Name, Last_Name, Email, Phone, Mailing_City, Mailing_State
              from Contacts
              where id is not null
              order by Modified_Time desc
              limit 200`;
    case "engagementsByContact":
      return `select id, Name, Engagement_Type, Engagement_Status, Retainer_Status, Open_Date
              from Engagements
              where Client = ${safeId(params.contactId)}
              order by Modified_Time desc
              limit 200`;
    case "allLeads":
      return `select id, First_Name, Last_Name, Email, Phone, Mobile, Company,
                     Lead_Status, Lead_Source, Practice_Area, Description,
                     Owner, Converted_Contact, Created_Time, Modified_Time
              from Leads
              where id is not null
              order by Created_Time desc
              limit 200`;
    case "allReferrals":
      return `select id, Name
              from Referrals
              where id is not null
              order by Name asc
              limit 200`;
    case "ssdiCaseSearch": {
      const q = safeLike(params.q);
      return `select id, Case_Number, Current_Stage, Sub_Status, Deadline_Date
              from SSDI_Cases
              where Case_Number like ${q}
              order by Modified_Time desc
              limit 10`;
    }
    case "contactSearch": {
      const q = safeLike(params.q);
      return `select id, First_Name, Last_Name, Email, Phone
              from Contacts
              where Last_Name like ${q}
              limit 10`;
    }
    case "leadSearch": {
      const q = safeLike(params.q);
      return `select id, First_Name, Last_Name, Email, Company, Lead_Status
              from Leads
              where Last_Name like ${q}
              limit 10`;
    }
    case "engagementSearch": {
      const q = safeLike(params.q);
      return `select id, Name, Engagement_Type, Engagement_Status
              from Engagements
              where Name like ${q}
              limit 10`;
    }
  }
}


