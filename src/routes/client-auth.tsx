/**
 * /client-auth — Magic-link sign-in for SSDI clients (separate from staff /auth).
 *
 * Clients receive their initial invite by email; this page is a fallback for
 * returning sign-ins ("email me a new link"). It does NOT create accounts on
 * its own — staff enroll clients via the case page.
 */
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const FIRM_DOMAIN = "gatorlawpc.com";

export const Route = createFileRoute("/client-auth")({
  head: () => ({ meta: [{ title: "Client portal sign-in — Gator" }] }),
  component: ClientAuthPage,
});

function ClientAuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
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
      email: email.trim(),
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
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl text-primary">Client portal</h1>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Gator Law SSDI clients
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          {sent ? (
            <div className="text-sm">
              <p className="font-medium">Check your email.</p>
              <p className="mt-2 text-muted-foreground">
                We sent a sign-in link to {email}. The link is good for one use; if it
                doesn't arrive in a few minutes, contact your attorney.
              </p>
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
