/**
 * ClientPortalSettings — Settings card on the client portal.
 *
 * - Email opt-out toggle (non-blocking, default opted-in)
 * - SMS placeholder (greyed out — coming soon)
 * - Shows captured consent language + timestamp
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getMyMessagingConsent, setMyEmailOptOut } from "@/lib/messaging.functions";
import { Switch } from "@/components/ui/switch";
import { Bell, BellOff, MessageSquare } from "lucide-react";

export function ClientPortalSettings() {
  const getFn = useServerFn(getMyMessagingConsent);
  const setFn = useServerFn(setMyEmailOptOut);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-messaging-consent"], queryFn: () => getFn() });
  const m = useMutation({
    mutationFn: (optedOut: boolean) => setFn({ data: { optedOut } }),
    onSuccess: (_d, optedOut) => {
      toast.success(optedOut ? "Email updates turned off." : "Email updates turned on.");
      qc.invalidateQueries({ queryKey: ["my-messaging-consent"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (q.isLoading || !q.data) return null;
  const optedIn = !q.data.emailOptedOut;

  return (
    <section className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Bell className="h-3.5 w-3.5" /> Notification settings
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm">Email me case updates</div>
          <p className="text-xs text-muted-foreground mt-1">{q.data.currentEmailConsentText}</p>
          {q.data.emailConsentAt && optedIn ? (
            <p className="text-[10px] text-muted-foreground mt-1">
              Consent recorded {new Date(q.data.emailConsentAt).toLocaleString()}
            </p>
          ) : null}
          {q.data.emailOptedOutAt ? (
            <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1">
              Opted out {new Date(q.data.emailOptedOutAt).toLocaleString()}
            </p>
          ) : null}
        </div>
        <Switch checked={optedIn} onCheckedChange={(on) => m.mutate(!on)} disabled={m.isPending} />
      </div>

      <div className="flex items-start justify-between gap-4 opacity-60">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5" /> SMS reminders
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">Coming soon</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Text-message reminders aren't available yet. We'll let you know when you can opt in.
          </p>
        </div>
        <Switch checked={false} disabled />
      </div>

      {!optedIn ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <BellOff className="h-3.5 w-3.5" />
          You won't receive case-update emails. Your attorney can still contact you directly.
        </div>
      ) : null}
    </section>
  );
}
