import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  exchangeFirmGrantCode,
  listFirmConnections,
  revokeFirmConnection,
  testFirmConnection,
  type FirmConnectionStatus,
} from "@/lib/credentials.functions";
import { CheckCircle2, AlertCircle, RefreshCw, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/connections")({
  component: ConnectionsPage,
});

function ConnectionsPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listFirmConnections);
  const { data, isLoading, error } = useQuery({
    queryKey: ["firm-connections"],
    queryFn: () => fetchList(),
  });

  if (error) {
    return (
      <div className="rounded border border-destructive/40 bg-destructive/10 p-4 text-sm">
        {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <div className="font-medium text-foreground mb-1">How rotation works</div>
        Generate a one-time grant code in{" "}
        <a
          href="https://api-console.zoho.com"
          target="_blank"
          rel="noreferrer"
          className="text-primary inline-flex items-center gap-1 hover:underline"
        >
          Zoho API Console <ExternalLink className="h-3 w-3" />
        </a>{" "}
        with the scopes shown on each card, then paste it here. The code is
        single-use and is swapped server-side for a long-lived refresh token;
        the refresh token never reaches the browser.
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(data ?? []).map((c) => (
            <ConnectionCard
              key={c.key}
              c={c}
              onChanged={() => qc.invalidateQueries({ queryKey: ["firm-connections"] })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectionCard({
  c,
  onChanged,
}: {
  c: FirmConnectionStatus;
  onChanged: () => void;
}) {
  const [code, setCode] = useState("");
  const exchange = useServerFn(exchangeFirmGrantCode);
  const test = useServerFn(testFirmConnection);
  const revoke = useServerFn(revokeFirmConnection);

  const exMut = useMutation({
    mutationFn: () => exchange({ data: { key: c.key, code: code.trim() } }),
    onSuccess: () => {
      toast.success(`${c.label} connected`);
      setCode("");
      onChanged();
    },
    onError: (e: any) => toast.error(e.message ?? "Exchange failed"),
  });

  const testMut = useMutation({
    mutationFn: () => test({ data: { key: c.key } }),
    onSuccess: (r: any) => {
      r.ok ? toast.success(r.message) : toast.error(r.message);
      onChanged();
    },
    onError: (e: any) => toast.error(e.message ?? "Test failed"),
  });

  const revokeMut = useMutation({
    mutationFn: () => revoke({ data: { key: c.key } }),
    onSuccess: () => {
      toast.success(`${c.label} revoked`);
      onChanged();
    },
    onError: (e: any) => toast.error(e.message ?? "Revoke failed"),
  });

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{c.label}</div>
          <div className="text-xs text-muted-foreground mt-0.5 font-mono">
            {c.scopes.join(", ")}
          </div>
        </div>
        {c.connected ? (
          <span className="inline-flex items-center gap-1 text-xs rounded-full bg-primary/15 text-primary px-2 py-0.5">
            <CheckCircle2 className="h-3 w-3" /> Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs rounded-full bg-muted text-muted-foreground px-2 py-0.5">
            <AlertCircle className="h-3 w-3" /> Not connected
          </span>
        )}
      </div>

      {!c.configured && (
        <div className="text-xs rounded border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-1.5">
          Client ID / secret env vars are not set for this connection.
        </div>
      )}

      <dl className="text-xs grid grid-cols-2 gap-y-1 text-muted-foreground">
        <dt>Token tail</dt>
        <dd className="font-mono text-foreground">
          {c.refreshTail ? `…${c.refreshTail}` : "—"}
        </dd>
        <dt>Last rotated</dt>
        <dd className="text-foreground">{fmt(c.lastRotatedAt)}</dd>
        <dt>Last verified</dt>
        <dd className="text-foreground">{fmt(c.lastVerifiedAt)}</dd>
      </dl>

      <div className="space-y-2">
        <Label htmlFor={`code-${c.key}`} className="text-xs">
          Paste grant code to rotate
        </Label>
        <div className="flex gap-2">
          <Input
            id={`code-${c.key}`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="1000.xxxxxxxx…"
            className="font-mono text-xs"
          />
          <Button
            size="sm"
            onClick={() => exMut.mutate()}
            disabled={!code.trim() || exMut.isPending || !c.configured}
          >
            {exMut.isPending ? "…" : "Rotate"}
          </Button>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() => testMut.mutate()}
          disabled={!c.connected || testMut.isPending}
        >
          <RefreshCw className="h-3 w-3 mr-1.5" />
          {testMut.isPending ? "Testing…" : "Test"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            if (confirm(`Revoke ${c.label}? Anything using this token will stop working.`)) {
              revokeMut.mutate();
            }
          }}
          disabled={!c.connected || revokeMut.isPending}
        >
          Revoke
        </Button>
      </div>
    </div>
  );
}

function fmt(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
