import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { PRACTICES, type PracticeSlug } from "@/practices/registry";
import { Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/practices/$practice")({
  head: () => ({ meta: [{ title: "Practice — Gator" }] }),
  component: PracticeStub,
});

function PracticeStub() {
  const { practice } = useParams({ from: "/_authenticated/practices/$practice" });
  const entry = PRACTICES.find((p) => p.slug === (practice as PracticeSlug));

  const backLink = (
    <Link
      to="/dashboard"
      className="inline-flex shrink-0 items-center text-sm text-muted-foreground hover:text-foreground"
    >
      ← Back to dashboard
    </Link>
  );

  if (!entry) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-5 space-y-3">
        <div className="flex justify-end">{backLink}</div>
        <div className="py-12 text-center">
          <h1 className="font-display text-3xl text-foreground">Unknown practice area</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            That practice isn't part of the firm.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-5 space-y-3">
      <div className="flex justify-end">{backLink}</div>
      <div>
        <div className="text-xs uppercase tracking-[0.18em] text-primary/80">Practice workspace</div>
        <h1 className="font-display text-4xl text-foreground mt-1">{entry.label}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{entry.tagline}</p>

        <div className="mt-8 rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-primary">
            <Lock className="h-4 w-4" />
            <div className="font-medium">Coming soon</div>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            The {entry.label} workspace is scaffolded but not yet built. {entry.label} engagements
            already appear in the firm-wide{" "}
            <Link to="/engagements" className="text-primary hover:underline">Engagements</Link>{" "}
            list and roll up into the dashboard. The dedicated workspace — matter detail, deadlines,
            and stage workflow — slots in here when the practice goes live.
          </p>
        </div>
      </div>
    </div>
  );
}
