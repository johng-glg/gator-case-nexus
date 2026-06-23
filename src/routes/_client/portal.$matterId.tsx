/**
 * /portal/$matterId — Detail view for one matter (any practice).
 *
 * Renders entirely off the `PortalMatter` shape, so the same component works
 * for SSDI, FCRA, FDCPA, TCPA, or Class Action. The adapter on the server has
 * already enforced the client-safe allowlist — nothing here exposes raw data.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyPortalView } from "@/lib/portal.functions";
import { getUploadUrl, recordUpload } from "@/lib/documents.functions";
import { ClientDocumentsSection } from "@/components/portal/ClientDocumentsSection";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, LogOut, Calendar, FileSignature, Upload, ClipboardList, Info,
} from "lucide-react";
import { toast } from "sonner";
import type { PortalAction } from "@/integrations/portal/portal";

export const Route = createFileRoute("/_client/portal/$matterId")({
  head: () => ({ meta: [{ title: "Your matter — Gator Law" }] }),
  component: MatterDetailPage,
});

function MatterDetailPage() {
  const { matterId } = Route.useParams();
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
    return <div className="p-8 text-base text-muted-foreground">Loading your matter…</div>;
  }
  const data = portal.data;
  if (!data || !data.linked) {
    return (
      <div className="max-w-xl mx-auto p-8">
        <p className="text-base text-muted-foreground">No matter found for your account.</p>
        <Button variant="outline" className="mt-4" onClick={signOut}>Sign out</Button>
      </div>
    );
  }

  const matter = data.view.matters.find((m) => m.id === matterId);
  if (!matter) {
    return (
      <div className="max-w-xl mx-auto p-8 space-y-3">
        <p className="text-base">We can't find that matter on your account.</p>
        <Link to="/portal" className="text-sm text-primary underline-offset-2 hover:underline">
          ← Back to your matters
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {data.view.matters.length > 1 ? (
            <Link
              to="/portal"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> All matters
            </Link>
          ) : (
            <div className="text-xs uppercase tracking-[0.18em] text-primary/80">
              Gator Law — Client portal
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{matter.practice}</Badge>
          </div>
          <h1 className="mt-1 font-display text-3xl text-foreground">{matter.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Signed in as {data.email}</p>
        </div>
        <Button variant="outline" size="sm" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-1.5" /> Sign out
        </Button>
      </header>

      <section className="rounded-lg border border-border bg-card p-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Current status
        </div>
        <div className="mt-2 font-display text-2xl">{matter.statusLabel}</div>
        {matter.statusDetail ? (
          <p className="mt-2 text-base text-muted-foreground">{matter.statusDetail}</p>
        ) : null}
      </section>

      {matter.actionsNeeded.length > 0 ? (
        <section className="rounded-lg border border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/30 p-5">
          <div className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-300">
            What we need from you
          </div>
          <ul className="mt-3 space-y-3">
            {matter.actionsNeeded.map((a, i) => (
              <ActionRow key={i} action={a} matterId={matter.id} caseId={matter.caseId} />
            ))}
          </ul>
        </section>
      ) : null}

      {matter.keyDates.length > 0 ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" /> Key dates
          </div>
          <ul className="mt-2 space-y-1">
            {matter.keyDates.map((k, i) => (
              <li key={i} className="text-base">
                <span className="font-medium">{k.label}:</span> {k.date}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ClientDocumentsSection caseId={matter.caseId} engagementId={matter.id} />

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Your team
        </div>
        <p className="mt-2 text-base">{matter.attorney ?? "Gator Law team"}</p>
      </section>
    </div>
  );
}

function ActionRow({
  action,
  matterId,
  caseId,
}: {
  action: PortalAction;
  matterId: string;
  caseId?: string;
}) {
  const queryClient = useQueryClient();
  const getUrl = useServerFn(getUploadUrl);
  const recordUp = useServerFn(recordUpload);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!caseId) throw new Error("Uploads aren't available for this matter yet.");
      const requestId = action.ref ?? null;
      const { storagePath, signedUrl } = await getUrl({
        data: { caseId, requestId, fileName: file.name, size: file.size },
      });
      const put = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status}).`);
      await recordUp({
        data: {
          caseId,
          requestId,
          storagePath,
          originalName: file.name,
          size: file.size,
          mime: file.type || undefined,
        },
      });
    },
    onSuccess: (_d, file) => {
      toast.success(`Uploaded ${file.name}.`);
      queryClient.invalidateQueries({ queryKey: ["portal-view"] });
      queryClient.invalidateQueries({ queryKey: ["client-document-requests"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed."),
  });

  const Icon =
    action.type === "sign"
      ? FileSignature
      : action.type === "upload"
      ? Upload
      : action.type === "questionnaire"
      ? ClipboardList
      : Info;
  return (
    <li className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <Icon className="h-4 w-4 mt-0.5 text-amber-700 dark:text-amber-300 shrink-0" />
        <span className="text-base">{action.label}</span>
      </div>
      {action.type === "upload" ? (
        <label className="shrink-0">
          <input
            type="file"
            className="hidden"
            disabled={!caseId || upload.isPending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              e.target.value = "";
            }}
          />
          <Button asChild size="sm" disabled={!caseId || upload.isPending}>
            <span>
              <Upload className="h-3 w-3 mr-1" />
              {upload.isPending ? "Uploading…" : caseId ? "Upload" : "Available after case opens"}
            </span>
          </Button>
        </label>
      ) : action.type === "questionnaire" ? (
        <span className="text-xs text-muted-foreground shrink-0">We'll send this when ready</span>
      ) : null}
    </li>
  );
}
