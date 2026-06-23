/**
 * /client-auth — Passwordless sign-in for Gator Law clients.
 *
 * Sends a magic link AND a 6-digit code to the client's email; either works.
 * The code path survives link-mangling by spam filters and is more accessible
 * for older or low-tech users.
 */
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const FIRM_DOMAIN = "gatorlawpc.com";

export const Route = createFileRoute("/client-auth")({
  head: () => ({ meta: [{ title: "Client portal sign-in — Gator Law" }] }),
  component: ClientAuthPage,
});

function ClientAuthPage() {
  const navigate = useNavigate();
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
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/portal`,
        shouldCreateUser: false,
      },
    });
    setSending(false);
    if (error) {
      toast.error(error.message || "Couldn't send sign-in link.");
      return;
    }
    setSent(true);
    toast.success("Check your email for the link or 6-digit code.");
  }

  async function verifyCode() {
    setVerifying(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "email",
    });
    setVerifying(false);
    if (error) {
      toast.error(error.message || "Couldn't verify code.");
      return;
    }
    navigate({ to: "/portal", replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl text-primary">Client portal</h1>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Gator Law clients
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          {sent ? (
            <div className="space-y-4">
              <div className="text-sm">
                <p className="font-medium">Check your email.</p>
                <p className="mt-2 text-muted-foreground">
                  We sent a sign-in link and a 6-digit code to{" "}
                  <span className="font-medium text-foreground">{email}</span>. Tap
                  the link in the email, or enter the code below.
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
                  <span className="text-muted-foreground">6-digit code</span>
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className="mt-1 text-center text-2xl tracking-[0.4em] font-mono"
                  />
                </label>
                <Button
                  type="submit"
                  className="w-full"
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
                  className="block w-full text-xs text-muted-foreground hover:text-foreground"
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
                <span className="text-muted-foreground">Email</span>
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1"
                />
              </label>
              <Button type="submit" className="w-full" disabled={sending}>
                {sending ? "Sending…" : "Email me a sign-in link"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Only clients enrolled by Gator Law can sign in here. If you're staff,{" "}
                <a href="/auth" className="text-primary underline-offset-2 hover:underline">
                  go to staff sign-in
                </a>
                .
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
