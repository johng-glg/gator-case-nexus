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
  configured: boolean; // client_id + secret present in env
};

export const listFirmConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FirmConnectionStatus[]> => {
    await assertAdmin(context as any);
    const { getCredentialsService, getFirmConnections } = await import(
      "@/integrations/zoho/credentialsClient.server"
    );
    const creds = getCredentialsService();
    const conns = getFirmConnections();
    const statuses = await creds.list();
    return statuses.map((s) => {
      const c = conns.find((x) => x.key === s.key)!;
      return { ...s, configured: !!(c.clientId && c.clientSecret) };
    });
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
    const creds = getCredentialsService();
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
    return (await getCredentialsService().test(data.key));
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
    await getCredentialsService().revoke(data.key);
    return { ok: true };
  });
