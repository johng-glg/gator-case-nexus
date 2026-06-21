/**
 * credentialsClient.server.ts — wires credentialsService against the firm
 * token store. Client ID / secret are loaded from the DB first (set via
 * Settings → Connections); env vars are used as a fallback.
 */
import { createCredentialsService, type FirmConnection, type ConnectionKey } from "./credentialsService";
import { firmTokenStore, firmMetaStore } from "./firmTokenStore.server";
import type { DataCenter } from "./zohoClient";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Defaults = Pick<FirmConnection, "key" | "label" | "service" | "scopes">;

const DEFAULTS: Record<ConnectionKey, Defaults> = {
  SIGN_FIRM: {
    key: "SIGN_FIRM",
    label: "Zoho Sign (firm)",
    service: "sign",
    scopes: ["ZohoSign.documents.ALL"],
  },
  SERVICE: {
    key: "SERVICE",
    label: "Zoho CRM (service)",
    service: "crm",
    scopes: ["ZohoCRM.modules.ALL", "ZohoCRM.coql.READ"],
  },
};

function envFor(key: ConnectionKey): { clientId: string; clientSecret: string } {
  if (key === "SIGN_FIRM") {
    return {
      clientId: process.env.ZOHO_SIGN_CLIENT_ID ?? "",
      clientSecret: process.env.ZOHO_SIGN_CLIENT_SECRET ?? "",
    };
  }
  return {
    clientId: process.env.ZOHO_CLIENT_ID ?? "",
    clientSecret: process.env.ZOHO_CLIENT_SECRET ?? "",
  };
}

export async function getFirmConnections(): Promise<FirmConnection[]> {
  const { data, error } = await supabaseAdmin
    .from("zoho_firm_tokens" as any)
    .select("key, client_id, client_secret");
  if (error) throw error;
  const rows = new Map<string, any>((data ?? []).map((r: any) => [r.key, r]));
  return (Object.keys(DEFAULTS) as ConnectionKey[]).map((key) => {
    const env = envFor(key);
    const row = rows.get(key);
    return {
      ...DEFAULTS[key],
      clientId: row?.client_id || env.clientId,
      clientSecret: row?.client_secret || env.clientSecret,
    };
  });
}

export async function getCredentialsService() {
  const dc = (process.env.ZOHO_DC ?? "us") as DataCenter;
  return createCredentialsService({
    tokenStore: firmTokenStore,
    metaStore: firmMetaStore,
    connections: await getFirmConnections(),
    dc,
  });
}

/** Persist client_id/secret for a connection. Empty values clear them (env fallback applies). */
export async function saveFirmClientCredentials(
  key: ConnectionKey,
  clientId: string,
  clientSecret: string,
): Promise<void> {
  const existing = await supabaseAdmin
    .from("zoho_firm_tokens" as any)
    .select("key")
    .eq("key", key)
    .maybeSingle();

  const payload: Record<string, unknown> = {
    key,
    client_id: clientId || null,
    client_secret: clientSecret || null,
    updated_at: new Date().toISOString(),
  };

  if (existing.data) {
    const { error } = await supabaseAdmin
      .from("zoho_firm_tokens" as any)
      .update(payload)
      .eq("key", key);
    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin
      .from("zoho_firm_tokens" as any)
      .insert(payload);
    if (error) throw error;
  }
}
