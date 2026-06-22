/**
 * /portal — Client-facing read-only view of the claimant's SSDI case.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyClientPortal } from "@/lib/portal.functions";
import { ClientDocumentsSection } from "@/components/portal/ClientDocumentsSection";
import { ClientPortalSettings } from "@/components/portal/ClientPortalSettings";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, AlertTriangle, Calendar, Gavel, FileText, Clock } from "lucide-react";
import { normalizeStage } from "@/integrations/zoho/lifecycle";

export const Route = createFileRoute("/_client/portal")({
  head: () => ({ meta: [{ title: "Your case — Gator Law" }] }),
  component: PortalPage,
});

function PortalPage() {
  const navigate = useNavigate();
  const fetchPortal = useServerFn(getMyClientPortal);
  const portal = useQuery({
    queryKey: ["client-portal"],
    queryFn: () => fetchPortal(),
  });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/client-auth", replace: true });
  }

  if (portal.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading your case…</div>;
  }
  if (portal.error) {
    return (
      <div className="max-w-xl mx-auto p-8">
        <p className="text-sm text-destructive">{(portal.error as Error).message}</p>
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
        <h1 className="font-display text-2xl">Not enrolled</h1>
        <p className="text-sm text-muted-foreground">
          Your sign-in works, but this email isn't linked to a case yet. Please contact
          your attorney at Gator Law and ask them to send you a portal invite.
        </p>
        <Button variant="outline" onClick={signOut}>
          Sign out
        </Button>
      </div>
    );
  }

  const c = data.case;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.18em] text-primary/80">
            Gator Law — Client portal
          </div>
          <h1 className="font-display text-3xl text-foreground mt-1">Your case</h1>
          <p className="mt-1 text-sm text-muted-foreground">Signed in as {data.email}</p>
        </div>
        <Button variant="outline" size="sm" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-1.5" /> Sign out
        </Button>
      </header>

      {!c ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          We couldn't load your case right now. Please try again in a few minutes.
        </div>
      ) : (
        <>
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Case {c.caseNumber ?? "—"}
            </div>
            <div className="mt-1 font-display text-2xl">
              {c.currentStage ? normalizeStage(c.currentStage) : "—"}
            </div>
            {c.subStatus ? (
              <div className="mt-1 text-sm text-muted-foreground">{c.subStatus}</div>
            ) : null}
            {c.dateOpened ? (
              <div className="mt-3 text-xs text-muted-foreground">
                Opened {c.dateOpened}
              </div>
            ) : null}
          </section>

          {c.deadlineDate ? (
            <section className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Next deadline
              </div>
              <div className="mt-2 flex items-baseline gap-3">
                <div className="font-display text-2xl">{c.deadlineDate}</div>
                {typeof c.daysToDeadline === "number" ? (
                  <DaysBadge days={c.daysToDeadline} />
                ) : null}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Your attorney is tracking this date. If you have questions, contact the
                firm directly.
              </p>
            </section>
          ) : null}

          {c.hearingDate ? (
            <section className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Gavel className="h-3.5 w-3.5" /> ALJ hearing
              </div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <Field label="Date" value={c.hearingDate} />
                <Field label="Type" value={c.hearingType ?? "—"} />
                <Field label="Hearing office" value={c.hearingOffice ?? "—"} />
                <Field label="ALJ" value={c.aljName ?? "—"} />
              </div>
            </section>
          ) : null}

          {c.noticeOfAwardDate ? (
            <section className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <FileText className="h-3.5 w-3.5" /> Award
              </div>
              <p className="mt-2 text-sm">
                Notice of Award received {c.noticeOfAwardDate}. Your attorney will be in
                touch about next steps.
              </p>
            </section>
          ) : null}

          <ClientDocumentsSection caseId={data.caseId} />

          <ClientPortalSettings />

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" /> Your attorney
            </div>
            <p className="mt-2 text-sm">{c.attorneyName ?? "Gator Law team"}</p>
          </section>
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function DaysBadge({ days }: { days: number }) {
  const past = days < 0;
  const urgent = !past && days <= 14;
  const cls = past
    ? "bg-destructive/15 text-destructive border-destructive/30"
    : urgent
    ? "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300"
    : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {past ? <AlertTriangle className="h-3 w-3" /> : null}
      {past ? `${Math.abs(days)} days overdue` : `${days} days left`}
    </span>
  );
}
