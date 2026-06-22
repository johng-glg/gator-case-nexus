/**
 * ClientDocumentsSection — portal-side UI for clients to see what the firm has
 * requested and upload files to fulfill those requests.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getMyDocumentRequests,
  getUploadUrl,
  recordUpload,
} from "@/lib/documents.functions";
import { Button } from "@/components/ui/button";
import { FolderUp, Upload, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";

function fmtBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function ClientDocumentsSection({ caseId }: { caseId: string }) {
  const queryClient = useQueryClient();
  const fetchReqs = useServerFn(getMyDocumentRequests);
  const getUrl = useServerFn(getUploadUrl);
  const recordUp = useServerFn(recordUpload);

  const q = useQuery({
    queryKey: ["client-document-requests"],
    queryFn: () => fetchReqs(),
  });

  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async ({ file, requestId }: { file: File; requestId: string | null }) => {
      const { storagePath, signedUrl } = await getUrl({
        data: { caseId, requestId, fileName: file.name, size: file.size },
      });
      const put = await fetch(signedUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!put.ok) throw new Error(`Upload failed (${put.status}).`);
      await recordUp({
        data: {
          caseId, requestId, storagePath,
          originalName: file.name, size: file.size, mime: file.type || undefined,
        },
      });
    },
    onSuccess: (_d, vars) => {
      toast.success(`Uploaded ${vars.file.name}.`);
      queryClient.invalidateQueries({ queryKey: ["client-document-requests"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed."),
    onSettled: () => setUploadingId(null),
  });

  function handlePick(requestId: string | null, file: File) {
    setUploadingId(requestId ?? "adhoc");
    upload.mutate({ file, requestId });
  }

  if (q.isLoading) return null;
  const data = q.data;
  if (!data || !data.linked) return null;

  const open = data.requests.filter((r) => r.status === "open");
  const past = data.requests.filter((r) => r.status !== "open");

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <FolderUp className="h-3.5 w-3.5" /> Documents
      </div>

      {open.length === 0 && past.length === 0 && data.uploads.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Your attorney hasn't requested any documents from you yet.
        </p>
      ) : null}

      {open.length > 0 && (
        <ul className="mt-3 space-y-2">
          {open.map((r) => (
            <li key={r.id} className="rounded-md border border-border/60 bg-background/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                      <Clock className="h-2.5 w-2.5" /> Needed
                    </span>
                    <span className="text-sm font-medium">{r.label}</span>
                  </div>
                  {r.instructions && (
                    <p className="mt-1 text-xs text-muted-foreground">{r.instructions}</p>
                  )}
                </div>
                <label className="shrink-0">
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handlePick(r.id, f);
                      e.target.value = "";
                    }}
                  />
                  <Button asChild size="sm" disabled={uploadingId === r.id}>
                    <span><Upload className="h-3 w-3 mr-1" />{uploadingId === r.id ? "Uploading…" : "Upload"}</span>
                  </Button>
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(past.length > 0 || data.uploads.length > 0) && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            What you've already sent ({data.uploads.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {data.uploads.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2 border-l-2 border-emerald-500/40 pl-2">
                <span className="truncate">
                  <CheckCircle2 className="h-3 w-3 inline mr-1 text-emerald-600" />
                  {u.original_name} <span className="text-muted-foreground">· {fmtBytes(u.size_bytes)}</span>
                </span>
                <span className="text-muted-foreground">{new Date(u.uploaded_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
