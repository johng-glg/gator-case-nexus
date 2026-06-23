import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  exchangeFirmGrantCode,
  getSignTemplateActions,
  listFirmConnections,
  revokeFirmConnection,
  saveFirmClientCreds,
  testFirmConnection,
  type FirmConnectionStatus,
} from "@/lib/credentials.functions";
import { getConnectionStatus, getAuthorizeUrl } from "@/lib/zoho.functions";
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
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            In{" "}
            <a
              href="https://api-console.zoho.com"
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex items-center gap-1 hover:underline"
            >
              Zoho API Console <ExternalLink className="h-3 w-3" />
            </a>
            , create a <strong>Self Client</strong> and copy its Client ID / Client Secret into the card below.
          </li>
          <li>
            On the Self Client's "Generate Code" tab, paste the scopes from the card, generate a code,
            and paste it into <em>Grant code</em>.
          </li>
          <li>
            Click <strong>Rotate</strong>. The code is single-use and is swapped server-side for a
            long-lived refresh token; nothing secret returns to the browser.
          </li>
        </ol>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(data ?? [])
            .filter((c) => c.key === "SIGN_FIRM")
            .map((c) => (
              <ConnectionCard
                key={c.key}
                c={c}
                onChanged={() => qc.invalidateQueries({ queryKey: ["firm-connections"] })}
              />
            ))}
          <UserCrmCard />
        </div>
      )}
    </div>
  );
}

function UserCrmCard() {
  const fetchStatus = useServerFn(getConnectionStatus);
  const fetchAuthUrl = useServerFn(getAuthorizeUrl);
  const { data, isLoading } = useQuery({
    queryKey: ["user-zoho-status"],
    queryFn: () => fetchStatus(),
  });

  const connectMut = useMutation({
    mutationFn: async () => {
      const { url } = await fetchAuthUrl();
      // Zoho's consent screen refuses to render inside iframes (X-Frame-Options),
      // which blanks the Lovable preview. Break out to the top window when possible.
      try {
        (window.top ?? window).location.assign(url);
      } catch {
        window.open(url, "_blank", "noopener");
      }
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to start Zoho auth"),
  });

  const connected = !!data?.connected;

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">Zoho CRM (your account)</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Per-user OAuth. Powers your CRM reads/writes (cases, engagements, contacts).
          </div>
        </div>
        {isLoading ? (
          <span className="inline-flex items-center gap-1 text-xs rounded-full bg-muted text-muted-foreground px-2 py-0.5">
            …
          </span>
        ) : connected ? (
          <span className="inline-flex items-center gap-1 text-xs rounded-full bg-primary/15 text-primary px-2 py-0.5">
            <CheckCircle2 className="h-3 w-3" /> Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs rounded-full bg-muted text-muted-foreground px-2 py-0.5">
            <AlertCircle className="h-3 w-3" /> Not connected
          </span>
        )}
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          This connection is unique to <strong>your</strong> Zoho user — not a firm-wide service
          token. Each staff member authorizes their own.
        </p>
        <p>
          The Zoho Sign card above is the firm-wide service token for sending retainers and other
          background work.
        </p>
      </div>

      <div className="flex gap-2 pt-1 border-t border-border -mx-5 px-5 pt-3">
        <Button
          size="sm"
          variant={connected ? "outline" : "default"}
          onClick={() => connectMut.mutate()}
          disabled={connectMut.isPending}
        >
          {connectMut.isPending
            ? "Redirecting…"
            : connected
            ? "Reconnect"
            : "Connect Zoho CRM"}
        </Button>
      </div>
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
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [code, setCode] = useState("");

  const save = useServerFn(saveFirmClientCreds);
  const exchange = useServerFn(exchangeFirmGrantCode);
  const test = useServerFn(testFirmConnection);
  const revoke = useServerFn(revokeFirmConnection);

  const rotateMut = useMutation({
    mutationFn: async () => {
      // 1) Save client credentials if the user provided them
      if (clientId.trim() && clientSecret.trim()) {
        await save({
          data: { key: c.key, clientId: clientId.trim(), clientSecret: clientSecret.trim() },
        });
      } else if (!c.configured) {
        throw new Error("Enter Client ID and Client Secret first.");
      }
      // 2) Exchange the grant code for a refresh token
      await exchange({ data: { key: c.key, code: code.trim() } });
    },
    onSuccess: () => {
      toast.success(`${c.label} connected`);
      setCode("");
      setClientSecret("");
      onChanged();
    },
    onError: (e: any) => toast.error(e.message ?? "Rotation failed"),
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

      <dl className="text-xs grid grid-cols-2 gap-y-1 text-muted-foreground">
        <dt>Client ID</dt>
        <dd className="font-mono text-foreground">
          {c.clientIdTail ? `…${c.clientIdTail}` : "not set"}
        </dd>
        <dt>Refresh token</dt>
        <dd className="font-mono text-foreground">
          {c.refreshTail ? `…${c.refreshTail}` : "—"}
        </dd>
        <dt>Last rotated</dt>
        <dd className="text-foreground">{fmt(c.lastRotatedAt)}</dd>
        <dt>Last verified</dt>
        <dd className="text-foreground">{fmt(c.lastVerifiedAt)}</dd>
      </dl>

      <div className="space-y-2 pt-1">
        <div>
          <Label htmlFor={`cid-${c.key}`} className="text-xs">
            Client ID {c.configured && <span className="text-muted-foreground">(leave blank to keep)</span>}
          </Label>
          <Input
            id={`cid-${c.key}`}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={c.configured ? "•••• stored ••••" : "1000.XXXXXXXX…"}
            className="font-mono text-xs"
          />
        </div>
        <div>
          <Label htmlFor={`csec-${c.key}`} className="text-xs">
            Client Secret {c.configured && <span className="text-muted-foreground">(leave blank to keep)</span>}
          </Label>
          <Input
            id={`csec-${c.key}`}
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={c.configured ? "•••• stored ••••" : "client secret"}
            className="font-mono text-xs"
          />
        </div>
        <div>
          <Label htmlFor={`code-${c.key}`} className="text-xs">
            Grant code (from Self Client → Generate Code)
          </Label>
          <Input
            id={`code-${c.key}`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="1000.xxxxxxxx…"
            className="font-mono text-xs"
          />
        </div>
        <Button
          size="sm"
          className="w-full"
          onClick={() => rotateMut.mutate()}
          disabled={
            rotateMut.isPending ||
            !code.trim() ||
            (!c.configured && (!clientId.trim() || !clientSecret.trim()))
          }
        >
          {rotateMut.isPending ? "Rotating…" : "Save & Rotate"}
        </Button>
      </div>

      <div className="flex gap-2 pt-1 border-t border-border -mx-5 px-5 pt-3">
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
          className="text-destructive hover:text-destructive ml-auto"
          onClick={() => {
            if (
              confirm(`Revoke ${c.label}? Anything using this token will stop working.`)
            ) {
              revokeMut.mutate();
            }
          }}
          disabled={!c.connected || revokeMut.isPending}
        >
          Revoke
        </Button>
      </div>

      {c.key === "SIGN_FIRM" && c.connected && <SignTemplateInspector />}
    </div>
  );
}

function SignTemplateInspector() {
  const [templateId, setTemplateId] = useState("520301000000081001");
  const fetchActions = useServerFn(getSignTemplateActions);
  const m = useMutation({
    mutationFn: () => fetchActions({ data: { templateId: templateId.trim() } }),
    onError: (e: any) => toast.error(e.message ?? "Failed to read template"),
  });
  return (
    <div className="pt-3 border-t border-border space-y-2">
      <div className="text-xs font-medium text-foreground">Discover template action IDs</div>
      <div className="text-[11px] text-muted-foreground">
        Paste your Zoho Sign template ID to find the client signer's <code>action_id</code> — set it as the
        <code className="mx-1">ZOHO_SIGN_ACTION_ID</code> secret.
      </div>
      <div className="flex gap-2">
        <Input
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          placeholder="Template ID"
          className="font-mono text-xs"
        />
        <Button size="sm" variant="outline" onClick={() => m.mutate()} disabled={m.isPending}>
          {m.isPending ? "Reading…" : "Read"}
        </Button>
      </div>
      {m.data && (
        <div className="rounded border border-border bg-muted/30 p-2 text-xs space-y-1">
          {m.data.templateName && (
            <div className="text-muted-foreground">Template: <span className="text-foreground">{m.data.templateName}</span></div>
          )}
          {m.data.actions.length === 0 ? (
            <div className="text-muted-foreground">No actions returned.</div>
          ) : (
            <ul className="space-y-1">
              {m.data.actions.map((a: any) => (
                <li key={a.action_id} className="font-mono text-[11px] flex flex-wrap gap-x-2">
                  <span className="text-primary">{a.action_type}</span>
                  <span className="text-foreground">{a.action_id}</span>
                  {a.role && <span className="text-muted-foreground">role: {a.role}</span>}
                  {a.recipient_email && <span className="text-muted-foreground">{a.recipient_email}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
