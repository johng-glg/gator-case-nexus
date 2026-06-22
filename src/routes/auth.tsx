/**
 * /auth — Google sign-in only, restricted to the gatorlawpc.com Workspace.
 */
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import gatorLogo from "@/assets/gator-logo.png.asset.json";

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
      <div className="w-full max-w-sm rounded-lg border border-primary/30 bg-primary p-8">
        <div className="text-center mb-8">
          <img src={gatorLogo.url} alt="Gator" className="mx-auto h-28 w-auto" />
          <p className="mt-3 text-xs uppercase tracking-[0.18em] text-primary-foreground/80">
            Case platform
          </p>
        </div>
        <Button
          className="w-full bg-[#C9A84C] hover:bg-[#b8983f] text-[#1a3c2a] font-semibold shadow"
          onClick={signIn}
          disabled={busy}
        >
          {busy ? "Signing in…" : "Continue with Google"}
        </Button>
        <p className="mt-4 text-center text-xs text-primary-foreground/80">
          Restricted to @{ALLOWED_DOMAIN} accounts.
        </p>
      </div>
    </div>
  );
}
