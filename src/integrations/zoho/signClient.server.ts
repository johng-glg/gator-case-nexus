/**
 * signClient.server.ts — firm-level Zoho Sign access-token getter + retainer service factory.
 * Server-only. One Sign connection for the whole firm (not per-user).
 *
 * Env required at call time (read inside the handler, never at module scope):
 *   ZOHO_SIGN_CLIENT_ID, ZOHO_SIGN_CLIENT_SECRET, ZOHO_SIGN_REFRESH_TOKEN
 *   ZOHO_SIGN_TEMPLATE_ID, ZOHO_SIGN_ACTION_ID
 *   ZOHO_DC (optional, default "us") — shared with CRM client
 *   ZOHO_SIGN_WEBHOOK_SECRET (used by the webhook route, not here)
 */
import { createZohoSignAdapter, type ZohoSignAdapterConfig } from "./zohoSignAdapter";
import { createRetainerService } from "./retainerService";
import { makeZohoClient } from "./client.server";

const ACCOUNTS_HOSTS: Record<string, string> = {
  us: "https://accounts.zoho.com",
  eu: "https://accounts.zoho.eu",
  in: "https://accounts.zoho.in",
  au: "https://accounts.zoho.com.au",
  jp: "https://accounts.zoho.jp",
  ca: "https://accounts.zohocloud.ca",
};

let cachedToken: { token: string; exp: number } | null = null;

/** Refresh-token grant against the firm Sign connection. Cached in-process until ~60s before expiry. */
async function getFirmSignAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now()) return cachedToken.token;

  const clientId = process.env.ZOHO_SIGN_CLIENT_ID;
  const clientSecret = process.env.ZOHO_SIGN_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_SIGN_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Zoho Sign is not configured: missing ZOHO_SIGN_CLIENT_ID / ZOHO_SIGN_CLIENT_SECRET / ZOHO_SIGN_REFRESH_TOKEN.",
    );
  }

  const dc = (process.env.ZOHO_DC ?? "us") as keyof typeof ACCOUNTS_HOSTS;
  const accounts = ACCOUNTS_HOSTS[dc] ?? ACCOUNTS_HOSTS.us;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  const res = await fetch(`${accounts}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(`Zoho Sign token refresh failed (${res.status}): ${json.error ?? JSON.stringify(json)}`);
  }
  cachedToken = {
    token: json.access_token,
    exp: Date.now() + (json.expires_in ?? 3600) * 1000 - 60_000,
  };
  return json.access_token;
}

/** Build the retainer service with the firm Sign adapter + per-user CRM client. */
export function makeRetainerService() {
  const templateId = process.env.ZOHO_SIGN_TEMPLATE_ID;
  const signActionId = process.env.ZOHO_SIGN_ACTION_ID;
  if (!templateId || !signActionId) {
    throw new Error(
      "Zoho Sign is not configured: missing ZOHO_SIGN_TEMPLATE_ID / ZOHO_SIGN_ACTION_ID.",
    );
  }
  const dc = (process.env.ZOHO_DC ?? "us") as ZohoSignAdapterConfig["dc"];
  const sign = createZohoSignAdapter({
    getAccessToken: getFirmSignAccessToken,
    templateId,
    signActionId,
    dc,
  });
  return createRetainerService({ zoho: makeZohoClient(), sign });
}
