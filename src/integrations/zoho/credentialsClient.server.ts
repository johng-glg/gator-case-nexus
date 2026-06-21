/**
 * credentialsClient.server.ts — wires credentialsService against the firm
 * token store and reads client_id/secret from env.
 */
import { createCredentialsService, type FirmConnection } from "./credentialsService";
import { firmTokenStore, firmMetaStore } from "./firmTokenStore.server";
import type { DataCenter } from "./zohoClient";

export function getFirmConnections(): FirmConnection[] {
  const signId = process.env.ZOHO_SIGN_CLIENT_ID ?? "";
  const signSecret = process.env.ZOHO_SIGN_CLIENT_SECRET ?? "";
  const crmId = process.env.ZOHO_CLIENT_ID ?? "";
  const crmSecret = process.env.ZOHO_CLIENT_SECRET ?? "";
  return [
    {
      key: "SIGN_FIRM",
      label: "Zoho Sign (firm)",
      service: "sign",
      scopes: ["ZohoSign.documents.ALL"],
      clientId: signId,
      clientSecret: signSecret,
    },
    {
      key: "SERVICE",
      label: "Zoho CRM (service)",
      service: "crm",
      scopes: ["ZohoCRM.modules.ALL", "ZohoCRM.coql.READ"],
      clientId: crmId,
      clientSecret: crmSecret,
    },
  ];
}

export function getCredentialsService() {
  const dc = (process.env.ZOHO_DC ?? "us") as DataCenter;
  return createCredentialsService({
    tokenStore: firmTokenStore,
    metaStore: firmMetaStore,
    connections: getFirmConnections(),
    dc,
  });
}
