/**
 * /portal — Multi-matter client landing. The portal is keyed to the Contact,
 * so this page returns the client's full set of matters (across practices).
 *
 *  - 0 matters but linked → "we've enrolled you; your matters will appear here"
 *  - 1 matter → redirect straight to /portal/$matterId
 *  - 2+ matters → "What we need from you" roll-up + matters list
 */
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyPortalView } from "@/lib/portal.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, ChevronRight, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_client/portal/")({
  head: () => ({ meta: [{ title: "Your matters — Gator Law" }] }),
  component: PortalLanding,
});

function PortalLanding() {
  const navigate = useNavigate();
  const fetchPortal = useServerFn(getMyPortalView);
  const portal = useQuery({
    queryKey: ["portal-view"],
    queryFn: () => fetchPortal(),
  });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/client-auth", replace: true });
  }

  if (portal.isLoading) {
    return <div className="p-8 text-base text-muted-foreground">Loading your matters…</div>;
  }
  if (portal.error) {
    return (
      <div className="max-w-xl mx-auto p-8">
        <p className="text-base text-destructive">{(portal.error as Error).message}</p>
        <Button variant="outline" className="mt-4" onClick={signOut}>
          Sign out
        </Button>
      </div>
    );
  }

  const data = portal.data;
  if (!data || !data.linked) {
    return (
      <div className="max-w-xl mx-auto p-8 space-y-3">
        <h1 className="font-display text-2xl">Not enrolled yet</h1>
        <p className="text-base text-muted-foreground">
          Your sign-in works, but we couldn't find a matter linked to this email.
          Please contact your attorney at Gator Law.
        </p>
        <Button variant="outline" onClick={signOut}>
          Sign out
        </Button>
      </div>
    );
  }

  const { matters, actionsSummary } = data.view;

  if (matters.length === 0) {
    return (
      <Shell email={data.email} onSignOut={signOut}>
        <div className="rounded-lg border border-border bg-card p-6 space-y-2">
          <div className="font-display text-xl">Welcome to Gator Law</div>
          <p className="text-base text-muted-foreground">
            We've enrolled you. Your matter will appear here as soon as your
            attorney finishes onboarding.
          </p>
        </div>
      </Shell>
    );
  }

  if (matters.length === 1) {
    return <Navigate to="/portal/$matterId" params={{ matterId: matters[0].id }} replace />;
  }

  return (
    <Shell email={data.email} onSignOut={signOut}>
      {actionsSummary.length > 0 ? (
        <section className="rounded-lg border border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/30 p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-amber-700 dark:text-amber-300">
            <AlertCircle className="h-3.5 w-3.5" />
            What we need from you
          </div>
          <ul className="mt-3 space-y-2">
            {actionsSummary.map((s, i) => (
              <li key={i} className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base">{s.action.label}</div>
                  <div className="text-xs text-muted-foreground">{s.matterTitle}</div>
                </div>
                <Link
                  to="/portal/$matterId"
                  params={{ matterId: s.matterId }}
                  className="text-sm text-primary underline-offset-2 hover:underline shrink-0"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
          Your matters
        </h2>
        {matters.map((m) => (
          <Link
            key={m.id}
            to="/portal/$matterId"
            params={{ matterId: m.id }}
            className="block rounded-lg border border-border bg-card p-5 hover:border-primary/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {m.practice}
                  </Badge>
                  {m.actionsNeeded.length > 0 ? (
                    <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300 text-[10px]">
                      Action needed
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-1 font-display text-lg">{m.title}</div>
                <div className="mt-1 text-base text-muted-foreground">{m.statusLabel}</div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
            </div>
          </Link>
        ))}
      </section>
    </Shell>
  );
}

function Shell({
  email,
  onSignOut,
  children,
}: {
  email: string;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.18em] text-primary/80">
            Gator Law — Client portal
          </div>
          <h1 className="font-display text-3xl text-foreground mt-1">Your matters</h1>
          <p className="mt-1 text-sm text-muted-foreground">Signed in as {email}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onSignOut}>
          <LogOut className="h-4 w-4 mr-1.5" /> Sign out
        </Button>
      </header>
      {children}
    </div>
  );
}