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

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? "";
      if (email.endsWith(`@${ALLOWED_DOMAIN}`)) {
        navigate({ to: "/dashboard", replace: true });
      } else if (data.user) {
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
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
      style={{ background: "radial-gradient(circle at 50% 40%, oklch(0.97 0.006 95) 0%, oklch(0.94 0.008 95) 70%, oklch(0.90 0.01 95) 100%)" }}
    >
      <div className="w-full max-w-sm rounded-xl border border-[#C9A84C]/30 bg-primary p-10 shadow-[0_25px_60px_-20px_rgba(0,0,0,0.35),inset_0_1px_1px_rgba(201,1685,76,0.1)]">
        <div className="text-center mb-10">
          <img src={gatorLogo.url} alt="Gator" className="mx-auto h-28 w-auto" />
          <h1
            className="mt-5 text-3xl font-bold tracking-tight text-[#C9A84C]"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            GATOR
          </h1>
          <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.22em] text-[#C9A84C]/70">
            Case Platform
          </p>
        </div>

        <div className="flex justify-center">
          <Button
            className="bg-[#C9A84C] hover:bg-[#b8983f] text-[#1a3c2a] font-medium shadow-md rounded-lg px-6 min-w-[240px]"
            onClick={signIn}
            disabled={busy}
          >
            <svg className="mr-2.5 h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {busy ? "Signing in…" : "Continue with Google"}
          </Button>
        </div>

        <p className="mt-5 text-center text-[11px] text-primary-foreground/70">
          Restricted to @{ALLOWED_DOMAIN} accounts.
        </p>
      </div>

      <p className="absolute bottom-6 text-[11px] text-muted-foreground/60">
        &copy; Gator Law, PC &middot; Confidential
      </p>
    </div>
  );
}
