/**
 * tokenStore.server.ts — ZohoTokenStore impl over the `zoho_tokens` table.
 *
 * Server-only. Uses the service-role client; refresh tokens never reach the browser.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ZohoTokenStore } from "./zohoClient";

export const zohoTokenStore: ZohoTokenStore = {
  async getRefreshToken(actorKey: string): Promise<string | null> {
    // SERVICE actor is read from env so background jobs work without an OAuth grant per process.
    // Fallback: if no env token is provisioned, borrow ANY connected user's refresh token so
    // webhooks (Zoho Sign, deadline sweep, etc.) still work. Attribution will be that user.
    if (actorKey === "SERVICE") {
      const envToken = process.env.ZOHO_SERVICE_REFRESH_TOKEN;
      if (envToken) return envToken;
      const { data } = await supabaseAdmin
        .from("zoho_tokens")
        .select("refresh_token")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.refresh_token ?? null;
    }
    const { data, error } = await supabaseAdmin
      .from("zoho_tokens")
      .select("refresh_token")
      .eq("user_id", actorKey)
      .maybeSingle();
    if (error) throw error;
    return data?.refresh_token ?? null;
  },

  async setRefreshToken(actorKey: string, refreshToken: string): Promise<void> {
    if (actorKey === "SERVICE") {
      // SERVICE refresh tokens are provisioned out-of-band; refuse silent overwrites here.
      throw new Error("Refuse to write SERVICE refresh token via tokenStore.");
    }
    const { error } = await supabaseAdmin
      .from("zoho_tokens")
      .upsert(
        {
          user_id: actorKey,
          refresh_token: refreshToken,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) throw error;
  },
};

export async function hasZohoConnection(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("zoho_tokens")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}
