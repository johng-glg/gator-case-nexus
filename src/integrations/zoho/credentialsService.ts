/**
 * credentialsService.ts — firm-level Zoho credential management (Gator Law)
 *
 * Manages the firm's long-lived Self Client refresh tokens (the ones NOT tied to a staff member):
 *   - SIGN_FIRM : Zoho Sign, scope ZohoSign.documents.ALL  → powers "Send retainer"
 *   - SERVICE   : Zoho CRM service actor, ZohoCRM.modules.ALL,ZohoCRM.coql.READ → nightly sweeps
 *
 * Rotation model (admin pastes a GRANT CODE, never a raw refresh token):
 *   admin generates a code in api-console.zoho.com → exchangeGrantCode(key, code) swaps it for a
 *   refresh token and stores it in the SAME ZohoTokenStore the per-user client uses, keyed by the
 *   connection key. The grant code is single-use and discarded; the refresh token never leaves the
 *   server. getAccessToken(key) mints short-lived access tokens (cached) for the adapters/sweep.
 *
 * Framework-agnostic (global fetch). Each connection carries its own client id/secret because the
 * Sign Self Client and the CRM app may be different API Console clients (with a shared fallback).
 */

import type { DataCenter, ZohoTokenStore } from "./zohoClient";

const ACCOUNTS: Record<DataCenter, string> = {
  us: "https://accounts.zoho.com",     eu: "https://accounts.zoho.eu",
  in: "https://accounts.zoho.in",      au: "https://accounts.zoho.com.au",
  jp: "https://accounts.zoho.jp",      ca: "https://accounts.zohocloud.ca",
};
const API: Record<DataCenter, string> = {
  us: "https://www.zohoapis.com",      eu: "https://www.zohoapis.eu",
  in: "https://www.zohoapis.in",       au: "https://www.zohoapis.com.au",
  jp: "https://www.zohoapis.jp",       ca: "https://www.zohoapis.ca",
};
const SIGN: Record<DataCenter, string> = {
  us: "https://sign.zoho.com",         eu: "https://sign.zoho.eu",
  in: "https://sign.zoho.in",          au: "https://sign.zoho.com.au",
  jp: "https://sign.zoho.jp",          ca: "https://sign.zohocloud.ca",
};

export type ConnectionKey = "SIGN_FIRM" | "SERVICE";

export interface FirmConnection {
  key: ConnectionKey;
  label: string;
  service: "crm" | "sign";
  scopes: string[];
  clientId: string;
  clientSecret: string;
}

/** Optional: persist rotation/verification metadata for the settings page. */
export interface CredentialMeta { lastRotatedAt?: string; lastVerifiedAt?: string; refreshTail?: string; }
export interface CredentialMetaStore {
  get(key: string): Promise<CredentialMeta | null>;
  set(key: string, meta: CredentialMeta): Promise<void>;
}

export interface ConnectionStatus {
  key: ConnectionKey;
  label: string;
  service: "crm" | "sign";
  scopes: string[];
  connected: boolean;          // a refresh token is stored
  refreshTail?: string;        // last 4 chars, for the admin to recognize which token
  lastRotatedAt?: string;
  lastVerifiedAt?: string;
}

interface TokenResponse { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; scope?: string; api_domain?: string; }

export interface CredentialsDeps {
  tokenStore: ZohoTokenStore;
  connections: FirmConnection[];
  dc?: DataCenter;             // default "us"
  metaStore?: CredentialMetaStore;
  now?: () => Date;
  fetchImpl?: typeof fetch;    // injectable for tests
}

export function createCredentialsService(deps: CredentialsDeps) {
  const dc = deps.dc ?? "us";
  const accounts = ACCOUNTS[dc];
  const doFetch = deps.fetchImpl ?? fetch;
  const now = () => (deps.now ? deps.now() : new Date());
  const cache = new Map<string, { token: string; exp: number }>(); // access-token cache per connection

  const conn = (key: ConnectionKey): FirmConnection => {
    const c = deps.connections.find((x) => x.key === key);
    if (!c) throw new Error(`Unknown firm connection "${key}".`);
    return c;
  };
  const tail = (s: string) => (s.length <= 4 ? s : s.slice(-4));

  async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
    const res = await doFetch(`${accounts}/oauth/v2/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    return (await res.json().catch(() => ({}))) as TokenResponse;
  }

  /** Swap a one-time grant code for a refresh token and store it. Returns the new status. */
  async function exchangeGrantCode(key: ConnectionKey, code: string): Promise<ConnectionStatus> {
    const c = conn(key);
    const json = await tokenRequest(new URLSearchParams({
      grant_type: "authorization_code",
      client_id: c.clientId, client_secret: c.clientSecret, code: code.trim(),
    }));
    if (!json.refresh_token) {
      throw new Error(`Token exchange failed for ${c.label}: ${json.error ?? "no refresh_token returned (code expired or wrong client?)"}`);
    }
    await deps.tokenStore.setRefreshToken(key, json.refresh_token);
    if (json.access_token) cache.set(key, { token: json.access_token, exp: now().getTime() + (json.expires_in ?? 3600) * 1000 - 60_000 });
    const meta: CredentialMeta = { lastRotatedAt: now().toISOString(), refreshTail: tail(json.refresh_token) };
    await deps.metaStore?.set(key, { ...(await deps.metaStore.get(key)), ...meta });
    return status(key);
  }

  /** Mint a short-lived access token for this connection (cached until ~1 min before expiry). */
  async function getAccessToken(key: ConnectionKey): Promise<string> {
    const hit = cache.get(key);
    if (hit && hit.exp > now().getTime()) return hit.token;
    const c = conn(key);
    const refresh = await deps.tokenStore.getRefreshToken(key);
    if (!refresh) throw new Error(`No token stored for ${c.label}. Rotate it on the Connections page.`);
    const json = await tokenRequest(new URLSearchParams({
      grant_type: "refresh_token",
      client_id: c.clientId, client_secret: c.clientSecret, refresh_token: refresh,
    }));
    if (!json.access_token) throw new Error(`Refresh failed for ${c.label}: ${json.error ?? "unknown"}`);
    // Diagnostic: log granted scopes + api_domain. Zoho returns these on refresh.
    console.log(`[zoho:${key}] refresh ok — scope="${json.scope ?? "(none)"}" api_domain="${json.api_domain ?? "(none)"}"`);
    if (key === "SIGN_FIRM" && json.scope && !/ZohoSign\.documents/i.test(json.scope)) {
      throw new Error(`Refresh token for ${c.label} is missing ZohoSign.documents scope. Granted scopes: "${json.scope}". Re-mint the refresh token from a self-client authorization that includes ZohoSign.documents.ALL.`);
    }
    const token = json.access_token;
    cache.set(key, { token, exp: now().getTime() + (json.expires_in ?? 3600) * 1000 - 60_000 });
    return token;
  }

  /** Live check that the stored token works. Updates lastVerifiedAt. Returns ok + a short message. */
  async function test(key: ConnectionKey): Promise<{ ok: boolean; message: string }> {
    const c = conn(key);
    try {
      const token = await getAccessToken(key);
      const url = c.service === "sign"
        ? `${SIGN[dc]}/api/v1/requests`
        : `${API[dc]}/crm/v8/users?type=CurrentUser`;
      const res = await doFetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
      const ok = res.ok;
      if (ok) await deps.metaStore?.set(key, { ...(await deps.metaStore.get(key)), lastVerifiedAt: now().toISOString() });
      return { ok, message: ok ? "Connection OK" : `Zoho returned ${res.status}` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Revoke the stored refresh token at Zoho and clear it locally. */
  async function revoke(key: ConnectionKey): Promise<void> {
    const refresh = await deps.tokenStore.getRefreshToken(key);
    if (refresh) {
      await doFetch(`${accounts}/oauth/v2/token/revoke?token=${encodeURIComponent(refresh)}`, { method: "POST" })
        .catch(() => undefined); // best-effort; clear locally regardless
    }
    await deps.tokenStore.setRefreshToken(key, "");
    cache.delete(key);
    await deps.metaStore?.set(key, { ...(await deps.metaStore?.get(key)), refreshTail: undefined, lastVerifiedAt: undefined });
  }

  async function status(key: ConnectionKey): Promise<ConnectionStatus> {
    const c = conn(key);
    const refresh = await deps.tokenStore.getRefreshToken(key);
    const meta = (await deps.metaStore?.get(key)) ?? {};
    return {
      key: c.key, label: c.label, service: c.service, scopes: c.scopes,
      connected: !!refresh,
      refreshTail: refresh ? tail(refresh) : meta.refreshTail,
      lastRotatedAt: meta.lastRotatedAt, lastVerifiedAt: meta.lastVerifiedAt,
    };
  }

  /** Status of every managed connection — drives the settings page. Never returns secrets. */
  async function list(): Promise<ConnectionStatus[]> {
    return Promise.all(deps.connections.map((c) => status(c.key)));
  }

  return { list, status, exchangeGrantCode, getAccessToken, test, revoke };
}

export type CredentialsService = ReturnType<typeof createCredentialsService>;

/** Drop-in for the Sign adapter's getAccessToken (see zohoSignAdapter.ts). */
export const firmSignAccessToken = (creds: CredentialsService) => () => creds.getAccessToken("SIGN_FIRM");
