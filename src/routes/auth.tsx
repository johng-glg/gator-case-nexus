/**
 * /auth — Google sign-in only, restricted to the gatorlawpc.com Workspace.
 */
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const ALLOWED_DOMAIN = "gatorlawpc.com";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Gator" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  // If already signed in (and domain-allowed), skip.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? "";
      if (email.endsWith(`@${ALLOWED_DOMAIN}`)) {
        navigate({ to: "/dashboard", replace: true });
      } else if (data.user) {
        // Wrong domain: sign out and warn.
        supabase.auth.signOut().then(() => {
          toast.error(`Only @${ALLOWED_DOMAIN} accounts can sign in.`);
        });
      }
    });
  }, [navigate]);

  async function signIn() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
      extraParams: { hd: ALLOWED_DOMAIN, prompt: "select_account" },
    });
    if (result.error) {
      setBusy(false);
      toast.error(result.error.message || "Sign-in failed.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl text-primary">Gator</h1>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Case platform
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          <Button className="w-full" onClick={signIn} disabled={busy}>
            {busy ? "Signing in…" : "Continue with Google"}
          </Button>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Restricted to @{ALLOWED_DOMAIN} accounts.
          </p>
        </div>
      </div>
    </div>
  );
}
