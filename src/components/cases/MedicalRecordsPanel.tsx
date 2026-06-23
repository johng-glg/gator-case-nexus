/**
 * MedicalRecordsPanel — per-case records-request tracker.
 *
 * Aging cells: amber > 30 days, red when isStale. Sweep doesn't bump count;
 * "Log follow-up" is the only action that calls applyFollowup() on the server.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listCaseRequests,
  createRequest,
  sendRequest,
  logFollowup,
  setRequestStatus,
} from "@/lib/medicalRecords.functions";
import { REQUEST_STATUSES, TRANSITIONS, type RequestStatus } from "@/integrations/zoho/medicalRecords";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Send, RotateCcw, AlertTriangle, Plus } from "lucide-react";
import { toast } from "sonner";

function agingClass(days: number, stale: boolean): string {
  if (stale) return "text-destructive font-medium";
  if (days > 30) return "text-amber-600 font-medium";
  return "text-muted-foreground";
}

export function MedicalRecordsPanel({ caseId }: { caseId: string }) {
  const list = useServerFn(listCaseRequests);
  const create = useServerFn(createRequest);
  const send = useServerFn(sendRequest);
  const followup = useServerFn(logFollowup);
  const setStatus = useServerFn(setRequestStatus);
  const qc = useQueryClient();

  const [provider, setProvider] = useState("");

  const query = useQuery({
    queryKey: ["medical-records", caseId],
    queryFn: () => list({ data: { caseId } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["medical-records", caseId] });

  const addM = useMutation({
    mutationFn: (providerName: string) => create({ data: { caseId, providerName } }),
    onSuccess: () => { setProvider(""); toast.success("Request added"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const sendM = useMutation({
    mutationFn: (requestId: string) => send({ data: { requestId } }),
    onSuccess: () => { toast.success("Marked as sent"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const followM = useMutation({
    mutationFn: (requestId: string) => followup({ data: { requestId } }),
    onSuccess: () => { toast.success("Follow-up logged"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const statusM = useMutation({
    mutationFn: (vars: { requestId: string; status: RequestStatus }) =>
      setStatus({ data: vars }),
    onSuccess: () => { toast.success("Status updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const counts = query.data?.counts ?? { total: 0, open: 0, stale: 0, received: 0 };
  const rows = query.data?.rows ?? [];
  const releaseBanner = (query.error as Error | null)?.message?.includes("SSA-827");

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <h3 className="font-semibold">Medical Records Requests</h3>
          <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
            <span>{counts.total} total</span>
            <span>·</span>
            <span>{counts.open} open</span>
            <span>·</span>
            <span>{counts.received} received</span>
            {counts.stale > 0 && (
              <>
                <span>·</span>
                <span className="text-destructive">{counts.stale} stale</span>
              </>
            )}
          </div>
        </div>
      </div>

      {releaseBanner && (
        <div className="m-4 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          SSA-827 release not signed/expired. Cannot send new requests until re-signed.
        </div>
      )}

      <div className="flex gap-2 border-b p-4">
        <Input
          placeholder="Provider name"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && provider.trim()) addM.mutate(provider.trim()); }}
        />
        <Button
          onClick={() => provider.trim() && addM.mutate(provider.trim())}
          disabled={!provider.trim() || addM.isPending}
        >
          <Plus className="mr-1 h-4 w-4" /> Add provider
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Provider</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Requested</th>
              <th className="px-4 py-2">Aging</th>
              <th className="px-4 py-2">Follow-ups</th>
              <th className="px-4 py-2">Next FU</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!query.isLoading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No records requests yet.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2">{r.Provider_Name ?? "—"}</td>
                <td className="px-4 py-2">
                  <Badge variant={r._isStale ? "destructive" : "secondary"}>{r.Request_Status}</Badge>
                </td>
                <td className="px-4 py-2 text-muted-foreground">{r.Requested_Date ?? "—"}</td>
                <td className={`px-4 py-2 ${agingClass(r._agingDays, r._isStale)}`}>
                  {r.Requested_Date ? `${r._agingDays}d` : "—"}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{r.Followup_Count ?? 0}</td>
                <td className="px-4 py-2 text-muted-foreground">{r._nextFollowup ?? "—"}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-1">
                    {r.Request_Status === "Not started" && (
                      <Button size="sm" variant="ghost" onClick={() => sendM.mutate(r.id!)} disabled={sendM.isPending}>
                        <Send className="mr-1 h-3 w-3" /> Send
                      </Button>
                    )}
                    {(r.Request_Status === "Requested" || r.Request_Status === "Followed up") && (
                      <Button size="sm" variant="ghost" onClick={() => followM.mutate(r.id!)} disabled={followM.isPending}>
                        <RotateCcw className="mr-1 h-3 w-3" /> Follow up
                      </Button>
                    )}
                    <Select
                      value={r.Request_Status}
                      onValueChange={(v) => statusM.mutate({ requestId: r.id!, status: v as RequestStatus })}
                    >
                      <SelectTrigger className="h-8 w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REQUEST_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
