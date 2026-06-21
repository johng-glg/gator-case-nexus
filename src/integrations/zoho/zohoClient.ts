/**
 * zohoClient.ts — Zoho CRM v8 client with PER-USER attribution (Gator Law)
 *
 * Why per-user: Zoho attributes Created By / Modified By / Owner to the user whose token
 * makes the call. There is no "act-as" header for record CRUD. So each staff member does a
 * one-time OAuth grant; the app stores their refresh token and calls Zoho AS them — actions
 * reflect the real person, natively. Background jobs use a reserved SERVICE actor.
 *
 * Framework-agnostic (uses global fetch). Provide a ZohoTokenStore backed by your secret store
 * (e.g., Supabase table keyed by actorKey). Never expose refresh tokens to the browser.
 *
 * Flow:
 *   1. Redirect user to client.authorizeUrl(state) — Zoho consent screen.
 *   2. On redirect back, call client.handleCallback(actorKey, code) once — stores their refresh token.
 *   3. Thereafter: client.as(actorKey).coql(...) / .createRecords(...) etc.
 */

// ---------- config & data centers ----------
export type DataCenter = "us" | "eu" | "in" | "au" | "jp" | "ca";

const DC: Record<DataCenter, { accounts: string; api: string }> = {
  us: { accounts: "https://accounts.zoho.com",      api: "https://www.zohoapis.com" },
  eu: { accounts: "https://accounts.zoho.eu",       api: "https://www.zohoapis.eu" },
  in: { accounts: "https://accounts.zoho.in",       api: "https://www.zohoapis.in" },
  au: { accounts: "https://accounts.zoho.com.au",   api: "https://www.zohoapis.com.au" },
  jp: { accounts: "https://accounts.zoho.jp",       api: "https://www.zohoapis.jp" },
  ca: { accounts: "https://accounts.zohocloud.ca",  api: "https://www.zohoapis.ca" },
};

export const SERVICE_ACTOR = "SERVICE" as const;

export const DEFAULT_SCOPES = [
  "ZohoCRM.modules.ALL",
  "ZohoCRM.settings.READ",
  "ZohoCRM.coql.READ",
  "ZohoCRM.users.READ",
  // add "ZohoSign.documents.ALL" when wiring e-sign
];

/** Persisted refresh tokens, keyed by actor (user id, or SERVICE). App supplies the impl. */
export interface ZohoTokenStore {
  getRefreshToken(actorKey: string): Promise<string | null>;
  setRefreshToken(actorKey: string, refreshToken: string): Promise<void>;
}

export interface ZohoConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenStore: ZohoTokenStore;
  dc?: DataCenter;            // default "us"
  scopes?: string[];         // default DEFAULT_SCOPES
}

// ---------- types ----------
export interface ZohoRecord { id?: string; [k: string]: unknown; }
interface TokenResponse { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; }

export class ZohoError extends Error {
  constructor(message: string, readonly status?: number, readonly body?: unknown) { super(message); }
}

// ---------- client ----------
export function createZohoClient(cfg: ZohoConfig) {
  const dc = DC[cfg.dc ?? "us"];
  const scopes = (cfg.scopes ?? DEFAULT_SCOPES).join(",");
  // in-memory access-token cache (per process); refreshes transparently on miss/expiry
  const accessCache = new Map<string, { token: string; exp: number }>();

  /** Step 1: where to send the user to grant access. `access_type=offline` → we get a refresh token. */
  function authorizeUrl(state: string): string {
    const p = new URLSearchParams({
      scope: scopes,
      client_id: cfg.clientId,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      redirect_uri: cfg.redirectUri,
      state,
    });
    return `${dc.accounts}/oauth/v2/auth?${p.toString()}`;
  }

  /** Step 2: exchange the one-time code for a refresh token and persist it for this actor. */
  async function handleCallback(actorKey: string, code: string): Promise<void> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      code,
    });
    const res = await fetch(`${dc.accounts}/oauth/v2/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    const json = (await res.json()) as TokenResponse;
    if (!json.refresh_token) throw new ZohoError(`No refresh token: ${json.error ?? "unknown"}`, res.status, json);
    await cfg.tokenStore.setRefreshToken(actorKey, json.refresh_token);
    if (json.access_token) accessCache.set(actorKey, { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 - 60_000 });
  }

  async function refreshAccessToken(actorKey: string): Promise<string> {
    const refresh = await cfg.tokenStore.getRefreshToken(actorKey);
    if (!refresh) throw new ZohoError(`No refresh token stored for actor "${actorKey}". User must authorize Zoho.`);
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: refresh,
    });
    const res = await fetch(`${dc.accounts}/oauth/v2/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    const json = (await res.json()) as TokenResponse;
    if (!json.access_token) throw new ZohoError(`Token refresh failed: ${json.error ?? "unknown"}`, res.status, json);
    accessCache.set(actorKey, { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 - 60_000 });
    return json.access_token;
  }

  async function accessToken(actorKey: string): Promise<string> {
    const c = accessCache.get(actorKey);
    if (c && c.exp > Date.now()) return c.token;
    return refreshAccessToken(actorKey);
  }

  /** Core request with one automatic retry on 401 (stale token). */
  async function request<T>(actorKey: string, method: string, path: string, body?: unknown): Promise<T> {
    const doFetch = async (token: string) =>
      fetch(`${dc.api}/crm/v8${path}`, {
        method,
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

    let res = await doFetch(await accessToken(actorKey));
    if (res.status === 401) res = await doFetch(await refreshAccessToken(actorKey));
    if (res.status === 204) return undefined as T;            // no content
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new ZohoError(`Zoho ${method} ${path} → ${res.status}`, res.status, json);
    return json as T;
  }

  function chunk<T>(arr: T[], n: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  }

  /** A view of the API scoped to a single actor — all calls attributed to them. */
  function as(actorKey: string) {
    return {
      /** Run a COQL query, auto-paginating (200/page) until exhausted. */
      async coql<T = ZohoRecord>(selectQuery: string): Promise<T[]> {
        const out: T[] = [];
        let offset = 0;
        const base = selectQuery.replace(/\s+limit\s+\d+(\s+offset\s+\d+)?\s*$/i, "").trim();
        // guard against accidental huge pulls
        for (let page = 0; page < 100; page++) {
          const q = `${base} limit 200 offset ${offset}`;
          const r = await request<{ data?: T[]; info?: { more_records?: boolean } }>(
            actorKey, "POST", "/coql", { select_query: q },
          );
          const rows = r.data ?? [];
          out.push(...rows);
          if (!r.info?.more_records || rows.length === 0) break;
          offset += 200;
        }
        return out;
      },

      async getRecord<T = ZohoRecord>(module: string, id: string, fields?: string[]): Promise<T | null> {
        const f = fields?.length ? `?fields=${encodeURIComponent(fields.join(","))}` : "";
        const r = await request<{ data?: T[] }>(actorKey, "GET", `/${module}/${id}${f}`);
        return r.data?.[0] ?? null;
      },

      /** Create up to any number of records; chunked to 100/call. Attributed to this actor. */
      async createRecords(module: string, records: ZohoRecord[]): Promise<unknown[]> {
        const results: unknown[] = [];
        for (const part of chunk(records, 100)) {
          const r = await request<{ data?: unknown[] }>(actorKey, "POST", `/${module}`, { data: part });
          results.push(...(r.data ?? []));
        }
        return results;
      },

      /** Update records (each must include `id`); chunked to 100/call. */
      async updateRecords(module: string, records: ZohoRecord[]): Promise<unknown[]> {
        const results: unknown[] = [];
        for (const part of chunk(records, 100)) {
          const r = await request<{ data?: unknown[] }>(actorKey, "PUT", `/${module}`, { data: part });
          results.push(...(r.data ?? []));
        }
        return results;
      },

      async deleteRecords(module: string, ids: string[]): Promise<unknown[]> {
        const results: unknown[] = [];
        for (const part of chunk(ids, 100)) {
          const r = await request<{ data?: unknown[] }>(actorKey, "DELETE", `/${module}?ids=${part.join(",")}`);
          results.push(...(r.data ?? []));
        }
        return results;
      },
    };
  }

  return { authorizeUrl, handleCallback, as, service: () => as(SERVICE_ACTOR) };
}

export type ZohoClient = ReturnType<typeof createZohoClient>;
