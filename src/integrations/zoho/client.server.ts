/**
 * client.server.ts — Zoho client factory. Server-only.
 * Reads OAuth config from env; binds the Supabase-backed token store.
 */
import { createZohoClient, type DataCenter, type ZohoClient } from "./zohoClient";
import { zohoTokenStore } from "./tokenStore.server";

let _client: ZohoClient | null = null;

export function makeZohoClient(): ZohoClient {
  if (_client) return _client;
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const redirectUri = process.env.ZOHO_REDIRECT_URI;
  const dc = (process.env.ZOHO_DC ?? "us") as DataCenter;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Zoho is not configured: missing ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REDIRECT_URI.");
  }
  _client = createZohoClient({
    clientId,
    clientSecret,
    redirectUri,
    dc,
    tokenStore: zohoTokenStore,
  });
  return _client;
}
