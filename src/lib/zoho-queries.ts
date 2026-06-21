/**
 * zoho-queries.ts — Whitelisted COQL templates the UI is allowed to invoke.
 *
 * The client never sends raw COQL; it sends a query name + params, and this map
 * decides what actually runs. Keeps the attack surface tiny.
 *
 * IMPORTANT: every interpolated value must be safe (id, enum, boolean) — no raw strings.
 * Identifiers we accept are Zoho record ids (alphanumeric) or known enum values.
 */

const ID = /^[A-Za-z0-9_]+$/;

function safeId(v: unknown): string {
  if (typeof v !== "string" || !ID.test(v)) throw new Error("Invalid id parameter.");
  return v;
}

export type QueryName =
  | "openCases"
  | "myOpenCases"
  | "deadlinesAtRisk"
  | "releasesExpiringSoon"
  | "pipelineByStage"
  | "costsByEngagement"
  | "casesByEngagement"
  | "engagementById";

export function buildQuery(name: QueryName, params: Record<string, unknown> = {}): string {
  switch (name) {
    case "openCases":
      return `select Case_Number, Current_Stage, Sub_Status, Deadline_Date, Days_To_Deadline, Engagement, Assigned_Case_Manager
              from SSDI_Cases
              where Is_Closed = false
              order by Date_Opened desc`;
    case "myOpenCases":
      return `select Case_Number, Current_Stage, Sub_Status, Engagement, Deadline_Date, Days_To_Deadline
              from SSDI_Cases
              where Assigned_Case_Manager = ${safeId(params.userId)} and Is_Closed = false
              order by Date_Opened desc`;
    case "deadlinesAtRisk":
      return `select Case_Number, Current_Stage, Active_Deadline_Type, Deadline_Date, Days_To_Deadline, Engagement
              from SSDI_Cases
              where Deadline_At_Risk = true and Is_Closed = false
              order by Days_To_Deadline asc`;
    case "releasesExpiringSoon":
      return `select Case_Number, Release_Expiration_Date, Engagement
              from SSDI_Cases
              where Release_Expiring_Soon = true and Is_Closed = false
              order by Release_Expiration_Date asc`;
    case "pipelineByStage":
      return `select Current_Stage, count(id)
              from SSDI_Cases
              where Is_Closed = false
              group by Current_Stage`;
    case "costsByEngagement":
      return `select id, Name, Amount, Cost_Type, Engagement
              from Costs
              where Engagement = ${safeId(params.engagementId)}`;
    case "casesByEngagement":
      return `select Case_Number, Current_Stage, Claim_Type, Date_Opened
              from SSDI_Cases
              where Engagement = ${safeId(params.engagementId)}`;
    case "engagementById":
      return `select Engagement_Name, Engagement_Type, Engagement_Status, Retainer_Status,
                     Client.First_Name, Client.Last_Name, All_Fees, Total_Costs1
              from Engagements
              where id = ${safeId(params.engagementId)}`;
  }
}
