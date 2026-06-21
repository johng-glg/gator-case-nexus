/**
 * credentials.functions.ts — admin-only server fns for managing firm Zoho
 * credentials. Refresh tokens never leave the server; responses include only
 * status (connected/refreshTail/timestamps).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KEY = z.enum(["SIGN_FIRM", "SERVICE"]);

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export type FirmConnectionStatus = {
  key: "SIGN_FIRM" | "SERVICE";
  label: string;
  service: "crm" | "sign";
  scopes: string[];
  connected: boolean;
  refreshTail?: string;
  lastRotatedAt?: string;
  lastVerifiedAt?: string;
  configured: boolean; // client_id + secret present (DB or env)
  clientIdTail?: string; // last 6 of client_id, for display
};

export const listFirmConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FirmConnectionStatus[]> => {
    await assertAdmin(context as any);
    const { getCredentialsService, getFirmConnections } = await import(
      "@/integrations/zoho/credentialsClient.server"
    );
    const creds = await getCredentialsService();
    const conns = await getFirmConnections();
    const statuses = await creds.list();
    return statuses.map((s) => {
      const c = conns.find((x) => x.key === s.key)!;
      return {
        ...s,
        configured: !!(c.clientId && c.clientSecret),
        clientIdTail: c.clientId ? c.clientId.slice(-6) : undefined,
      };
    });
  });

export const saveFirmClientCreds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { key: "SIGN_FIRM" | "SERVICE"; clientId: string; clientSecret: string }) =>
      z
        .object({
          key: KEY,
          clientId: z.string().min(1),
          clientSecret: z.string().min(1),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { saveFirmClientCredentials } = await import(
      "@/integrations/zoho/credentialsClient.server"
    );
    await saveFirmClientCredentials(data.key, data.clientId.trim(), data.clientSecret.trim());
    return { ok: true };
  });

export const exchangeFirmGrantCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: "SIGN_FIRM" | "SERVICE"; code: string }) =>
    z.object({ key: KEY, code: z.string().min(8) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { getCredentialsService } = await import(
      "@/integrations/zoho/credentialsClient.server"
    );
    const creds = await getCredentialsService();
    await creds.exchangeGrantCode(data.key, data.code);
    return { ok: true };
  });

export const testFirmConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: "SIGN_FIRM" | "SERVICE" }) =>
    z.object({ key: KEY }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { getCredentialsService } = await import(
      "@/integrations/zoho/credentialsClient.server"
    );
    const creds = await getCredentialsService();
    return creds.test(data.key);
  });

export const revokeFirmConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: "SIGN_FIRM" | "SERVICE" }) =>
    z.object({ key: KEY }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { getCredentialsService } = await import(
      "@/integrations/zoho/credentialsClient.server"
    );
    const creds = await getCredentialsService();
    await creds.revoke(data.key);
    return { ok: true };
  });

/** Admin helper: read a Zoho Sign template and return its actions (id, type, role, recipient).
 * Used to discover ZOHO_SIGN_ACTION_ID for the client signer role. */
export const getSignTemplateActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { templateId: string }) =>
    z.object({ templateId: z.string().regex(/^[0-9]+$/) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { getCredentialsService } = await import(
      "@/integrations/zoho/credentialsClient.server"
    );
    const creds = await getCredentialsService();
    const token = await creds.getAccessToken("SIGN_FIRM");
    const dc = (process.env.ZOHO_DC ?? "us").toLowerCase();
    const SIGN_HOSTS: Record<string, string> = {
      us: "https://sign.zoho.com", eu: "https://sign.zoho.eu", in: "https://sign.zoho.in",
      au: "https://sign.zoho.com.au", jp: "https://sign.zoho.jp", ca: "https://sign.zohocloud.ca",
    };
    const host = SIGN_HOSTS[dc] ?? SIGN_HOSTS.us;
    const res = await fetch(`${host}/api/v1/templates/${data.templateId}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Zoho Sign template fetch failed (${res.status}): ${JSON.stringify(json)}`);
    }
    const actions = json?.templates?.actions ?? json?.requests?.actions ?? [];
    return {
      templateName: json?.templates?.template_name ?? json?.templates?.request_name,
      actions: actions.map((a: any) => ({
        action_id: a.action_id,
        action_type: a.action_type,
        role: a.role,
        recipient_name: a.recipient_name,
        recipient_email: a.recipient_email,
      })),
    };
  });
