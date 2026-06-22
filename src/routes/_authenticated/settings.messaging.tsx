/**
 * /settings/messaging — admin toggles for client messaging milestones.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getMessagingSettings, setMessagingSettings } from "@/lib/messaging.functions";
import { MILESTONE_KEYS } from "@/integrations/messaging/messagingService";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/settings/messaging")({
  component: MessagingSettingsPage,
});

const HUMAN: Record<string, string> = {
  "stage:Application filed": "When the SSDI application is filed",
  "stage:Hearing scheduled": "When an ALJ hearing is scheduled",
  "stage:Award / NOA received": "When a Notice of Award is received",
  "stage:Initial decision - approved": "On initial-level approval",
  "stage:Recon decision - approved": "On reconsideration approval",
  "stage:ALJ decision - approved": "On ALJ approval",
  "event:documents-requested": "When the firm requests documents from the client",
  "event:documents-received": "When the client uploads documents",
};

function MessagingSettingsPage() {
  const fetchFn = useServerFn(getMessagingSettings);
  const saveFn = useServerFn(setMessagingSettings);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["messaging-settings"], queryFn: () => fetchFn() });
  const m = useMutation({
    mutationFn: (enabledMilestones: string[]) => saveFn({ data: { enabledMilestones } }),
    onSuccess: () => {
      toast.success("Saved.");
      qc.invalidateQueries({ queryKey: ["messaging-settings"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const enabled = new Set(q.data?.enabledMilestones ?? []);

  function toggle(key: string, on: boolean) {
    const next = new Set(enabled);
    if (on) next.add(key); else next.delete(key);
    m.mutate(Array.from(next));
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Client messaging</h2>
        <p className="text-sm text-muted-foreground">
          Pick which case milestones automatically email the client. Denial decisions are
          always held for attorney review regardless of these toggles.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {MILESTONE_KEYS.map((k) => (
          <div key={k} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <Label htmlFor={`m-${k}`} className="text-sm font-medium">
                {HUMAN[k] ?? k}
              </Label>
              <p className="text-xs text-muted-foreground">{k}</p>
            </div>
            <Switch
              id={`m-${k}`}
              checked={enabled.has(k)}
              onCheckedChange={(v) => toggle(k, !!v)}
              disabled={m.isPending}
            />
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">SMS reminders — coming soon.</strong>{" "}
        SMS notifications are deferred until the firm completes Twilio + A2P 10DLC setup.
        Until then, client messaging is email-only.
      </div>
    </div>
  );
}
