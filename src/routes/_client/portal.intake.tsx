/**
 * /portal/intake — Stub for the SSDI client intake questionnaire.
 *
 * The full questionnaire form (disability/work history, meds, providers) is a
 * follow-up build. For now this page just acknowledges the visit so the email
 * link doesn't 404.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";

export const Route = createFileRoute("/_client/portal/intake")({
  head: () => ({ meta: [{ title: "Intake questionnaire — Gator Law" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    engagement: typeof s.engagement === "string" ? s.engagement : undefined,
    case: typeof s.case === "string" ? s.case : undefined,
  }),
  component: PortalIntakePage,
});

function PortalIntakePage() {
  const { engagement, case: caseId } = Route.useSearch();
  const matterRef = engagement ?? caseId;
  return (
    <div className="max-w-xl mx-auto px-6 py-12">
      <div className="rounded-lg border border-border bg-card p-8 text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 grid place-items-center">
          <ClipboardList className="h-6 w-6 text-primary" />
        </div>
        <h1 className="font-display text-2xl">Intake questionnaire</h1>
        <p className="text-sm text-muted-foreground">
          Thanks for opening your questionnaire. The full form is being
          finalized — we&rsquo;ll send a short follow-up email as soon as
          it&rsquo;s ready. In the meantime, you can upload documents or
          message your team from your portal.
        </p>
        {caseId && (
          <p className="text-xs text-muted-foreground/70">
            Case reference: <code>{caseId}</code>
          </p>
        )}
        <Link
          to="/portal"
          className="inline-flex items-center text-sm text-primary hover:underline"
        >
          Back to your portal
        </Link>
      </div>
    </div>
  );
}
