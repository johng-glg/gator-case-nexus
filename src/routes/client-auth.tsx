/**
 * /client-auth — Passwordless sign-in for Gator Law clients.
 *
 * Sends a magic link AND a 6-digit code to the client's email; either works.
 * The code path survives link-mangling by spam filters and is more accessible
 * for older or low-tech users.
 */
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import gatorLogo from "@/assets/gator-logo.png.asset.json";
import { requestClientPortalSignInLink } from "@/lib/portal.functions";

const FIRM_DOMAIN = "gatorlawpc.com";
const GOLD = "#F1D391";

export const Route = createFileRoute("/client-auth")({
  head: () => ({ meta: [{ title: "Client portal sign-in — Gator Law" }] }),
  component: ClientAuthPage,
});

function ClientAuthPage() {
  const navigate = useNavigate();
  const requestPortalLink = useServerFn(requestClientPortalSignInLink);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const userEmail = data.user?.email ?? "";
      if (!userEmail) return;
      if (userEmail.toLowerCase().endsWith(`@${FIRM_DOMAIN}`)) {
        navigate({ to: "/dashboard", replace: true });
      } else {
        navigate({ to: "/portal", replace: true });
      }
    });
  }, [navigate]);

  async function requestLink() {
    setSending(true);
    try {
      await requestPortalLink({ data: { email: email.trim().toLowerCase() } });
      setSent(true);
      toast.success("Check your email for the link or 6-digit code.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send sign-in link.");
    } finally {
      setSending(false);
    }
  }

  async function verifyCode() {
    setVerifying(true);
    const normalizedEmail = email.trim().toLowerCase();
    const token = code.trim();
    // The code may have been minted as an invite (first-time) or magiclink
    // (returning). Supabase requires the matching `type`, so try both before
    // surfacing an error — otherwise users see a misleading "expired" message.
    const types: Array<"email" | "magiclink" | "invite"> = ["email", "magiclink", "invite"];
    let lastError: { message?: string } | null = null;
    for (const type of types) {
      const { error } = await supabase.auth.verifyOtp({ email: normalizedEmail, token, type });
      if (!error) {
        setVerifying(false);
        navigate({ to: "/portal", replace: true });
        return;
      }
      lastError = error;
    }
    setVerifying(false);
    toast.error(lastError?.message || "Couldn't verify code.");
  }

  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4"
      style={{
        background:
          "radial-gradient(circle at 50% 40%, oklch(0.97 0.006 95) 0%, oklch(0.94 0.008 95) 70%, oklch(0.90 0.01 95) 100%)",
      }}
    >
      <div
        className="w-full max-w-sm rounded-xl border bg-primary p-10 shadow-[0_25px_60px_-20px_rgba(0,0,0,0.35),inset_0_1px_1px_rgba(241,211,145,0.1)]"
        style={{ borderColor: `${GOLD}4D` }}
      >
        <div className="text-center mb-8">
          <img src={gatorLogo.url} alt="Gator" className="mx-auto h-28 w-auto" />
          <h1
            className="mt-5 text-3xl font-bold tracking-tight"
            style={{ fontFamily: '"Playfair Display", Georgia, serif', color: GOLD }}
          >
            GATOR
          </h1>
          <p
            className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.22em]"
            style={{ color: `${GOLD}B3` }}
          >
            Client Portal
          </p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="text-sm" style={{ color: GOLD }}>
              <p className="font-medium">Check your email.</p>
              <p className="mt-2" style={{ color: `${GOLD}B3` }}>
                We sent a sign-in link and a 6-digit code to{" "}
                <span className="font-medium" style={{ color: GOLD }}>{email}</span>.
                Tap the link in the email, or enter the code below.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim().length >= 6) verifyCode();
              }}
              className="space-y-3"
            >
              <label className="block text-sm">
                <span style={{ color: `${GOLD}B3` }}>6-digit code</span>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="mt-1 text-center text-2xl tracking-[0.4em] font-mono bg-transparent border-[color:var(--gold)]/40 text-[color:var(--gold)] placeholder:text-[color:var(--gold)]/40"
                  style={{ ['--gold' as never]: GOLD, borderColor: `${GOLD}66`, color: GOLD }}
                />
              </label>
              <Button
                type="submit"
                className="w-full font-medium shadow-md rounded-lg hover:opacity-90"
                style={{ backgroundColor: GOLD, color: "#1a3c2a" }}
                disabled={verifying || code.trim().length < 6}
              >
                {verifying ? "Signing in…" : "Sign in"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setCode("");
                }}
                className="block w-full text-xs hover:underline"
                style={{ color: `${GOLD}B3` }}
              >
                Use a different email
              </button>
            </form>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) requestLink();
            }}
            className="space-y-3"
          >
            <label className="block text-sm">
              <span style={{ color: `${GOLD}B3` }}>Email</span>
              <Input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 bg-transparent"
                style={{ borderColor: `${GOLD}66`, color: GOLD }}
              />
            </label>
            <Button
              type="submit"
              className="w-full font-medium shadow-md rounded-lg hover:opacity-90"
              style={{ backgroundColor: GOLD, color: "#1a3c2a" }}
              disabled={sending}
            >
              {sending ? "Sending…" : "Email me a sign-in link"}
            </Button>
            <p className="text-xs" style={{ color: `${GOLD}99` }}>
              Only clients enrolled by Gator Law can sign in here. If you're staff,{" "}
              <a
                href="/auth"
                className="underline-offset-2 hover:underline"
                style={{ color: GOLD }}
              >
                go to staff sign-in
              </a>
              .
            </p>
          </form>
        )}
      </div>

      <p className="absolute bottom-6 text-[11px] text-muted-foreground/60">
        &copy; Gator Law, PC &middot; Confidential
      </p>
    </div>
  );
}
