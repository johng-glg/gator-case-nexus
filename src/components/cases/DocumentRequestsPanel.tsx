/**
 * DocumentRequestsPanel — staff-side UI for the case detail page. Shows open and
 * past document requests, lets staff create a new request or upload a file
 * directly, and download anything the client has sent.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createDocumentRequest,
  cancelDocumentRequest,
  getCaseDocuments,
  getUploadUrl,
  recordUpload,
  getDownloadUrl,
} from "@/lib/documents.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { FileUp, FileText, Download, X, CheckCircle2, Clock, Upload } from "lucide-react";
import { toast } from "sonner";

function fmtBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export function DocumentRequestsPanel({
  caseId,
  engagementId,
}: {
  caseId: string;
  engagementId?: string;
}) {
  const queryClient = useQueryClient();
  const fetchDocs = useServerFn(getCaseDocuments);
  const createReq = useServerFn(createDocumentRequest);
  const cancelReq = useServerFn(cancelDocumentRequest);
  const getUrl = useServerFn(getUploadUrl);
  const recordUp = useServerFn(recordUpload);
  const getDl = useServerFn(getDownloadUrl);

  const q = useQuery({
    queryKey: ["case-documents", caseId],
    queryFn: () => fetchDocs({ data: { caseId } }),
  });

  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [instructions, setInstructions] = useState("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      createReq({ data: { caseId, engagementId, label: label.trim(), instructions: instructions.trim() || undefined } }),
    onSuccess: () => {
      toast.success("Document request created.");
      setOpen(false); setLabel(""); setInstructions("");
      queryClient.invalidateQueries({ queryKey: ["case-documents", caseId] });
      queryClient.invalidateQueries({ queryKey: ["case-activity", caseId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelReq({ data: { id } }),
    onSuccess: () => {
      toast.success("Request canceled.");
      queryClient.invalidateQueries({ queryKey: ["case-documents", caseId] });
      queryClient.invalidateQueries({ queryKey: ["case-activity", caseId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  async function uploadFile(file: File, requestId: string | null) {
    setUploadingId(requestId ?? "adhoc");
    try {
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
      toast.success(`Uploaded ${file.name}.`);
      queryClient.invalidateQueries({ queryKey: ["case-documents", caseId] });
      queryClient.invalidateQueries({ queryKey: ["case-activity", caseId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploadingId(null);
    }
  }

  async function download(uploadId: string) {
    try {
      const { signedUrl } = await getDl({ data: { uploadId } });
      window.open(signedUrl, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed.");
    }
  }

  const requests = q.data?.requests ?? [];
  const uploads = q.data?.uploads ?? [];
  const uploadsByReq = new Map<string | null, typeof uploads>();
  for (const u of uploads) {
    const k = u.request_id;
    const list = uploadsByReq.get(k) ?? [];
    list.push(u);
    uploadsByReq.set(k, list);
  }
  const adhocUploads = uploadsByReq.get(null) ?? [];

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" /> Document requests
        </div>
        <div className="flex gap-2">
          <label className="inline-flex">
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFile(f, null);
                e.target.value = "";
              }}
            />
            <Button asChild size="sm" variant="outline" disabled={uploadingId === "adhoc"}>
              <span><Upload className="h-3.5 w-3.5 mr-1.5" />{uploadingId === "adhoc" ? "Uploading…" : "Upload file"}</span>
            </Button>
          </label>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><FileUp className="h-3.5 w-3.5 mr-1.5" /> Request from client</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Request a document</DialogTitle></DialogHeader>
              <form
                onSubmit={(e) => { e.preventDefault(); if (label.trim()) create.mutate(); }}
                className="space-y-3"
              >
                <label className="block text-sm">
                  <span className="text-muted-foreground">What do you need?</span>
                  <Input
                    required
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g. Driver's license photo"
                    className="mt-1"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-muted-foreground">Instructions (optional)</span>
                  <Textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="e.g. Front and back, in color, no glare."
                    rows={3}
                    className="mt-1"
                  />
                </label>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={create.isPending || !label.trim()}>
                    {create.isPending ? "Sending…" : "Create request"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {q.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-xs text-destructive">{(q.error as Error).message}</p>}
      {!q.isLoading && requests.length === 0 && adhocUploads.length === 0 && (
        <p className="text-xs text-muted-foreground">No document requests or uploads yet.</p>
      )}

      <ul className="space-y-2">
        {requests.map((r) => {
          const ups = uploadsByReq.get(r.id) ?? [];
          return (
            <li key={r.id} className="rounded-md border border-border/60 bg-background/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={r.status} />
                    <span className="font-medium text-sm">{r.label}</span>
                  </div>
                  {r.instructions && (
                    <p className="mt-1 text-xs text-muted-foreground">{r.instructions}</p>
                  )}
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Requested {fmtDate(r.created_at)}{r.created_by_email ? ` · ${r.created_by_email}` : ""}
                  </div>
                </div>
                {r.status === "open" && (
                  <div className="flex gap-1 shrink-0">
                    <label>
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadFile(f, r.id);
                          e.target.value = "";
                        }}
                      />
                      <Button asChild size="sm" variant="outline" disabled={uploadingId === r.id}>
                        <span><Upload className="h-3 w-3 mr-1" />{uploadingId === r.id ? "Uploading…" : "Upload"}</span>
                      </Button>
                    </label>
                    <Button size="sm" variant="ghost" onClick={() => cancel.mutate(r.id)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
              {ups.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-border/60 pt-2">
                  {ups.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">{u.original_name} <span className="text-muted-foreground">· {fmtBytes(u.size_bytes)} · {fmtDate(u.uploaded_at)}{u.uploaded_by_email ? ` · ${u.uploaded_by_email}` : ""}</span></span>
                      <Button size="sm" variant="ghost" onClick={() => download(u.id)}>
                        <Download className="h-3 w-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}

        {adhocUploads.length > 0 && (
          <li className="rounded-md border border-border/60 bg-background/40 p-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Other uploads</div>
            <ul className="space-y-1">
              {adhocUploads.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{u.original_name} <span className="text-muted-foreground">· {fmtBytes(u.size_bytes)} · {fmtDate(u.uploaded_at)}{u.uploaded_by_email ? ` · ${u.uploaded_by_email}` : ""}</span></span>
                  <Button size="sm" variant="ghost" onClick={() => download(u.id)}>
                    <Download className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          </li>
        )}
      </ul>
    </section>
  );
}

function StatusBadge({ status }: { status: "open" | "fulfilled" | "canceled" }) {
  const map = {
    open: { cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30", icon: Clock, label: "Open" },
    fulfilled: { cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", icon: CheckCircle2, label: "Received" },
    canceled: { cls: "bg-muted text-muted-foreground border-border", icon: X, label: "Canceled" },
  } as const;
  const m = map[status];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${m.cls}`}>
      <Icon className="h-2.5 w-2.5" /> {m.label}
    </span>
  );
}
