/**
 * firmTokenStore.server.ts — ZohoTokenStore + CredentialMetaStore for firm-level
 * connections (SIGN_FIRM, SERVICE). Server-only; uses service-role client.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ZohoTokenStore } from "./zohoClient";
import type { CredentialMeta, CredentialMetaStore } from "./credentialsService";

export const firmTokenStore: ZohoTokenStore = {
  async getRefreshToken(key: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin
      .from("zoho_firm_tokens" as any)
      .select("refresh_token")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    return (data as any)?.refresh_token ?? null;
  },
  async setRefreshToken(key: string, refreshToken: string): Promise<void> {
    if (!refreshToken) {
      const { error } = await supabaseAdmin
        .from("zoho_firm_tokens" as any)
        .delete()
        .eq("key", key);
      if (error) throw error;
      return;
    }
    const { error } = await supabaseAdmin
      .from("zoho_firm_tokens" as any)
      .upsert(
        {
          key,
          refresh_token: refreshToken,
          refresh_tail: refreshToken.slice(-4),
          access_token: null,
          access_token_expires_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
    if (error) throw error;
  },

  async getCachedAccessToken(key: string) {
    const { data, error } = await supabaseAdmin
      .from("zoho_firm_tokens" as any)
      .select("access_token, access_token_expires_at")
      .eq("key", key)
      .maybeSingle();
    if (error) return null;
    const d = data as any;
    if (!d?.access_token || !d?.access_token_expires_at) return null;
    return { token: d.access_token as string, expiresAt: new Date(d.access_token_expires_at as string).getTime() };
  },

  async setCachedAccessToken(key: string, token: string, expiresAt: number) {
    const { error } = await supabaseAdmin
      .from("zoho_firm_tokens" as any)
      .update({
        access_token: token,
        access_token_expires_at: new Date(expiresAt).toISOString(),
      })
      .eq("key", key);
    if (error) throw error;
  },
};

export const firmMetaStore: CredentialMetaStore = {
  async get(key: string): Promise<CredentialMeta | null> {
    const { data, error } = await supabaseAdmin
      .from("zoho_firm_tokens" as any)
      .select("last_rotated_at, last_verified_at, refresh_tail")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const d = data as any;
    return {
      lastRotatedAt: d.last_rotated_at ?? undefined,
      lastVerifiedAt: d.last_verified_at ?? undefined,
      refreshTail: d.refresh_tail ?? undefined,
    };
  },
  async set(key: string, meta: CredentialMeta): Promise<void> {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ("lastRotatedAt" in meta) patch.last_rotated_at = meta.lastRotatedAt ?? null;
    if ("lastVerifiedAt" in meta) patch.last_verified_at = meta.lastVerifiedAt ?? null;
    if ("refreshTail" in meta) patch.refresh_tail = meta.refreshTail ?? null;
    // upsert minimal row if missing (refresh_token NOT NULL, so only update if row exists)
    const { data: existing } = await supabaseAdmin
      .from("zoho_firm_tokens" as any)
      .select("key")
      .eq("key", key)
      .maybeSingle();
    if (!existing) return; // no row to attach meta to
    const { error } = await supabaseAdmin
      .from("zoho_firm_tokens" as any)
      .update(patch)
      .eq("key", key);
    if (error) throw error;
  },
};
