/**
 * /unsubscribe — branded one-click unsubscribe page.
 *
 * Validates the token against /email/unsubscribe (server route created by the
 * email scaffold), then POSTs to confirm on user click.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mail, CheckCircle2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/unsubscribe")({
  ssr: false,
  head: () => ({ meta: [{ title: "Unsubscribe — Gator Law" }] }),
  component: UnsubscribePage,
});

type State =
  | { kind: "loading" }
  | { kind: "valid" }
  | { kind: "already" }
  | { kind: "invalid"; message: string }
  | { kind: "submitting" }
  | { kind: "done" };

function UnsubscribePage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const token = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("token");

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid", message: "Missing unsubscribe token." });
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) {
          setState({ kind: "invalid", message: data?.error ?? "Invalid or expired link." });
          return;
        }
        if (data?.valid === false && data?.reason === "already_unsubscribed") {
          setState({ kind: "already" });
          return;
        }
        setState({ kind: "valid" });
      } catch (e) {
        setState({ kind: "invalid", message: (e as Error).message });
      }
    })();
  }, [token]);

  async function confirm() {
    if (!token) return;
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ kind: "invalid", message: data?.error ?? "Failed to unsubscribe." });
        return;
      }
      setState({ kind: "done" });
    } catch (e) {
      setState({ kind: "invalid", message: (e as Error).message });
    }
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 space-y-5">
        <div className="flex items-center gap-2 text-primary">
          <Mail className="h-5 w-5" />
          <span className="text-xs uppercase tracking-[0.18em]">Gator Law</span>
        </div>
        <h1 className="font-display text-2xl">Unsubscribe</h1>

        {state.kind === "loading" && (
          <p className="text-sm text-muted-foreground">Checking your link…</p>
        )}
        {state.kind === "valid" && (
          <>
            <p className="text-sm text-muted-foreground">
              Confirm you want to stop receiving case-update emails from Gator Law. You'll still
              receive important account/security emails, and your attorney can still contact you
              directly.
            </p>
            <Button onClick={confirm} className="w-full">Confirm unsubscribe</Button>
          </>
        )}
        {state.kind === "submitting" && (
          <p className="text-sm text-muted-foreground">Updating your preferences…</p>
        )}
        {state.kind === "done" && (
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
            <p className="text-sm">You've been unsubscribed. We won't email you case updates again.</p>
          </div>
        )}
        {state.kind === "already" && (
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-5 w-5 text-muted-foreground mt-0.5" />
            <p className="text-sm text-muted-foreground">
              This email is already unsubscribed from case-update emails.
            </p>
          </div>
        )}
        {state.kind === "invalid" && (
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
            <p className="text-sm text-destructive">{state.message}</p>
          </div>
        )}
      </div>
    </main>
  );
}
