// @ts-nocheck
import { createCredentialsService, firmSignAccessToken, type FirmConnection } from "../credentialsService";

const NOW = () => new Date(Date.UTC(2026, 5, 20, 12, 0, 0));
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? "✓" : "✗"} ${l}`); c ? pass++ : fail++; };

const CONNS: FirmConnection[] = [
  { key: "SIGN_FIRM", label: "Zoho Sign (firm)", service: "sign",
    scopes: ["ZohoSign.documents.ALL"], clientId: "SIGNID", clientSecret: "SIGNSEC" },
  { key: "SERVICE", label: "Zoho CRM (service)", service: "crm",
    scopes: ["ZohoCRM.modules.ALL", "ZohoCRM.coql.READ"], clientId: "CRMID", clientSecret: "CRMSEC" },
];

// in-memory token + meta stores
function stores() {
  const tokens = new Map<string, string>();
  const metas = new Map<string, any>();
  return {
    tokenStore: {
      async getRefreshToken(k: string) { return tokens.get(k) || null; },
      async setRefreshToken(k: string, v: string) { v ? tokens.set(k, v) : tokens.delete(k); },
    },
    metaStore: { async get(k: string) { return metas.get(k) ?? null; }, async set(k: string, m: any) { metas.set(k, m); } },
    tokens, metas,
  };
}

// scripted fetch
function mockFetch(handlers: Array<(url: string, init: any) => any>) {
  const calls: Array<{ url: string; body?: string }> = [];
  let i = 0;
  const f = (async (url: string, init: any) => {
    calls.push({ url, body: init?.body?.toString?.() });
    const h = handlers[Math.min(i++, handlers.length - 1)];
    const r = h(url, init);
    return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.json ?? {} };
  }) as unknown as typeof fetch;
  return { f, calls };
}

(async () => {
  // ---- exchangeGrantCode stores refresh + caches access ----
  {
    const s = stores();
    const { f, calls } = mockFetch([() => ({ json: { refresh_token: "RT-aaaa", access_token: "AT-1", expires_in: 3600 } })]);
    const creds = createCredentialsService({ tokenStore: s.tokenStore, metaStore: s.metaStore, connections: CONNS, now: NOW, fetchImpl: f });
    const st = await creds.exchangeGrantCode("SIGN_FIRM", "  CODE123  ");
    ok("exchange hit token endpoint", calls[0].url.endsWith("/oauth/v2/token"));
    ok("exchange used grant_type=authorization_code", calls[0].body!.includes("grant_type=authorization_code"));
    ok("exchange used the SIGN client id", calls[0].body!.includes("client_id=SIGNID"));
    ok("code trimmed", calls[0].body!.includes("code=CODE123"));
    ok("refresh token stored", s.tokens.get("SIGN_FIRM") === "RT-aaaa");
    ok("status connected", st.connected === true);
    ok("status shows tail only (no full secret)", st.refreshTail === "aaaa");
    ok("lastRotatedAt set", typeof st.lastRotatedAt === "string");

    // getAccessToken returns cached token without a second network call
    const before = calls.length;
    const at = await creds.getAccessToken("SIGN_FIRM");
    ok("access token from cache", at === "AT-1" && calls.length === before);
  }

  // ---- exchange failure surfaces a clear error ----
  {
    const s = stores();
    const { f } = mockFetch([() => ({ json: { error: "invalid_code" } })]);
    const creds = createCredentialsService({ tokenStore: s.tokenStore, connections: CONNS, now: NOW, fetchImpl: f });
    let threw = false;
    try { await creds.exchangeGrantCode("SERVICE", "BAD"); } catch (e) { threw = e instanceof Error && /invalid_code|failed/i.test(e.message); }
    ok("bad grant code throws readable error", threw);
    ok("nothing stored on failure", s.tokens.get("SERVICE") === undefined);
  }

  // ---- getAccessToken refreshes when no cache ----
  {
    const s = stores();
    s.tokens.set("SERVICE", "RT-svc");
    const { f, calls } = mockFetch([() => ({ json: { access_token: "AT-svc", expires_in: 3600 } })]);
    const creds = createCredentialsService({ tokenStore: s.tokenStore, connections: CONNS, now: NOW, fetchImpl: f });
    const at = await creds.getAccessToken("SERVICE");
    ok("refresh exchange used refresh_token grant", calls[0].body!.includes("grant_type=refresh_token") && calls[0].body!.includes("refresh_token=RT-svc"));
    ok("returns access token", at === "AT-svc");
  }

  // ---- getAccessToken with no stored token guards ----
  {
    const s = stores();
    const { f } = mockFetch([() => ({ json: {} })]);
    const creds = createCredentialsService({ tokenStore: s.tokenStore, connections: CONNS, now: NOW, fetchImpl: f });
    let threw = false;
    try { await creds.getAccessToken("SIGN_FIRM"); } catch (e) { threw = e instanceof Error && /Rotate it/.test(e.message); }
    ok("missing token tells admin to rotate", threw);
  }

  // ---- test() pings the right host and records verification ----
  {
    const s = stores(); s.tokens.set("SIGN_FIRM", "RT");
    const { f, calls } = mockFetch([
      () => ({ json: { access_token: "AT", expires_in: 3600 } }), // refresh
      () => ({ ok: true, status: 200, json: {} }),                // currentuser ping
    ]);
    const creds = createCredentialsService({ tokenStore: s.tokenStore, metaStore: s.metaStore, connections: CONNS, now: NOW, fetchImpl: f });
    const r = await creds.test("SIGN_FIRM");
    ok("test ok", r.ok === true);
    ok("sign test hits sign.zoho.com/currentuser", calls[1].url.includes("sign.zoho.com/api/v1/currentuser"));
    ok("lastVerifiedAt recorded", typeof (await creds.status("SIGN_FIRM")).lastVerifiedAt === "string");
  }

  // ---- revoke clears token + calls revoke endpoint ----
  {
    const s = stores(); s.tokens.set("SERVICE", "RT-x");
    const { f, calls } = mockFetch([() => ({ ok: true, json: {} })]);
    const creds = createCredentialsService({ tokenStore: s.tokenStore, metaStore: s.metaStore, connections: CONNS, now: NOW, fetchImpl: f });
    await creds.revoke("SERVICE");
    ok("revoke endpoint called with token", calls[0].url.includes("/oauth/v2/token/revoke?token=RT-x"));
    ok("local token cleared", s.tokens.get("SERVICE") === undefined);
    ok("status now disconnected", (await creds.status("SERVICE")).connected === false);
  }

  // ---- list returns both, no secrets ----
  {
    const s = stores(); s.tokens.set("SIGN_FIRM", "RT-1234abcd");
    const { f } = mockFetch([() => ({ json: {} })]);
    const creds = createCredentialsService({ tokenStore: s.tokenStore, connections: CONNS, now: NOW, fetchImpl: f });
    const all = await creds.list();
    ok("list returns both connections", all.length === 2);
    ok("list exposes only tail, never full token", all.every((c) => !("refreshToken" in (c as any))) && all[0].refreshTail === "abcd");
  }

  // ---- firmSignAccessToken helper ----
  {
    const s = stores(); s.tokens.set("SIGN_FIRM", "RT");
    const { f } = mockFetch([() => ({ json: { access_token: "AT-helper", expires_in: 3600 } })]);
    const creds = createCredentialsService({ tokenStore: s.tokenStore, connections: CONNS, now: NOW, fetchImpl: f });
    const getter = firmSignAccessToken(creds);
    ok("helper resolves SIGN_FIRM access token", (await getter()) === "AT-helper");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
