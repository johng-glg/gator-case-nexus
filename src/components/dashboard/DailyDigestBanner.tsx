import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { myRoles } from "@/lib/users.functions";
import { AlertTriangle, Clock, FileWarning, ArrowRight } from "lucide-react";

interface DigestRow {
  id: string;
  ran_at: string;
  scanned: number;
  updated: number;
  overdue: unknown[];
  due_soon: unknown[];
  release_expiring: unknown[];
  error: string | null;
}

/**
 * Daily digest banner — admin-only. Pulls the latest nightly sweep row and
 * surfaces overdue / due-soon / release-expiring counts at the top of the
 * dashboard. Hidden when there's nothing to flag (or the user isn't admin).
 */
export function DailyDigestBanner() {
  const fetchRoles = useServerFn(myRoles);
  const rolesQ = useQuery({
    queryKey: ["my-roles"],
    queryFn: () => fetchRoles(),
    staleTime: 5 * 60_000,
  });
  const isAdmin = (rolesQ.data ?? []).includes("admin");

  const digestQ = useQuery({
    enabled: isAdmin,
    queryKey: ["latest-deadline-digest"],
    queryFn: async (): Promise<DigestRow | null> => {
      const { data, error } = await supabase
        .from("ssdi_deadline_digests")
        .select("id, ran_at, scanned, updated, overdue, due_soon, release_expiring, error")
        .order("ran_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as unknown as DigestRow) ?? null;
    },
    staleTime: 5 * 60_000,
  });

  if (!isAdmin) return null;
  const d = digestQ.data;
  if (!d) return null;

  const overdue = d.overdue?.length ?? 0;
  const dueSoon = d.due_soon?.length ?? 0;
  const release = d.release_expiring?.length ?? 0;
  const ranAt = new Date(d.ran_at);
  const ageHours = (Date.now() - ranAt.getTime()) / 36e5;
  const stale = ageHours > 30; // sweep is daily; >30h means it likely missed.

  // Nothing to flag and recent — don't render at all.
  if (!d.error && !stale && overdue === 0 && dueSoon === 0 && release === 0) return null;

  const tone = d.error || overdue > 0 || stale ? "danger" : "warn";

  return (
    <Link
      to="/settings/deadline-sweep"
      className={
        "block rounded-lg border p-4 transition-colors " +
        (tone === "danger"
          ? "border-destructive/40 bg-destructive/5 hover:bg-destructive/10"
          : "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10")
      }
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Daily deadline digest
          </div>
          {d.error ? (
            <div className="text-sm font-medium text-destructive">
              Last sweep failed: {d.error}
            </div>
          ) : stale ? (
            <div className="text-sm font-medium text-destructive">
              Last sweep ran {Math.round(ageHours)}h ago — the nightly job may be stuck.
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {overdue > 0 && (
                <span className="inline-flex items-center gap-1.5 font-medium text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" /> {overdue} overdue
                </span>
              )}
              {dueSoon > 0 && (
                <span className="inline-flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
                  <Clock className="h-3.5 w-3.5" /> {dueSoon} due within 7 days
                </span>
              )}
              {release > 0 && (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <FileWarning className="h-3.5 w-3.5" /> {release} SSA-827 expiring
                </span>
              )}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            Swept {ranAt.toLocaleString()} · {d.scanned} cases scanned, {d.updated} updated
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-xs text-primary whitespace-nowrap">
          View digest <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}
