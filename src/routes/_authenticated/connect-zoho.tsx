import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getAuthorizeUrl, getConnectionStatus } from "@/lib/zoho.functions";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/connect-zoho")({
  validateSearch: z.object({ error: z.string().optional() }),
  head: () => ({ meta: [{ title: "Connect Zoho — Gator" }] }),
  component: ConnectZoho,
});

function ConnectZoho() {
  const { error } = useSearch({ from: "/_authenticated/connect-zoho" });
  const navigate = useNavigate();
  const fetchUrl = useServerFn(getAuthorizeUrl);
  const fetchStatus = useServerFn(getConnectionStatus);
  const [busy, setBusy] = useState(false);

  const status = useQuery({
    queryKey: ["zoho-connection"],
    queryFn: () => fetchStatus(),
    refetchInterval: 3000,
  });

  if (status.data?.connected) {
    navigate({ to: "/dashboard", replace: true });
  }

  async function connect() {
    setBusy(true);
    try {
      const { url } = await fetchUrl();
      try {
        (window.top ?? window).location.assign(url);
      } catch {
        window.open(url, "_blank", "noopener");
      }
    } catch (e) {
      setBusy(false);
      alert(`Could not start Zoho connect: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Connect your Zoho account</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Every action you take in this app is recorded in Zoho CRM <em>as you</em> — Created By,
        Modified By, and record Owner reflect the real staff member. To make that work, grant
        the app access to your Zoho account once.
      </p>
      <div className="mt-6 rounded-lg border bg-card p-5">
        <Button onClick={connect} disabled={busy}>
          <ExternalLink className="h-4 w-4 mr-2" />
          {busy ? "Redirecting…" : "Authorize with Zoho"}
        </Button>
        {error && (
          <p className="mt-3 text-sm text-destructive">
            Connect failed: <code>{error}</code>. Try again.
          </p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          You'll be sent to Zoho to approve access to CRM modules, then bounced back here.
        </p>
      </div>
    </div>
  );
}
