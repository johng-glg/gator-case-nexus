/**
 * OAuth callback for the per-user Zoho connect flow.
 * Verifies HMAC state, exchanges the code, persists the refresh token, redirects home.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/zoho/connect/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errParam = url.searchParams.get("error");

        if (errParam) {
          return redirect(url, `/connect-zoho?error=${encodeURIComponent(errParam)}`);
        }
        if (!code || !state) {
          return redirect(url, "/connect-zoho?error=missing_params");
        }

        const { verifyState } = await import("@/integrations/zoho/state.server");
        const userId = verifyState(state);
        if (!userId) return redirect(url, "/connect-zoho?error=invalid_state");

        try {
          const { makeZohoClient } = await import("@/integrations/zoho/client.server");
          await makeZohoClient().handleCallback(userId, code);
        } catch (e) {
          console.error("Zoho callback failed:", e);
          return redirect(url, "/connect-zoho?error=token_exchange_failed");
        }

        return redirect(url, "/dashboard?connected=1");
      },
    },
  },
});

function redirect(reqUrl: URL, to: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: new URL(to, reqUrl.origin).toString() },
  });
}
