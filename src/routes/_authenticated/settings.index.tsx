import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { myRoles } from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/settings/")({
  component: SettingsIndex,
});

function SettingsIndex() {
  const fetchRoles = useServerFn(myRoles);
  const { data: roles = [] } = useQuery({
    queryKey: ["my-roles"],
    queryFn: () => fetchRoles(),
  });
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="text-sm text-muted-foreground">Your roles</div>
        <div className="mt-2 flex gap-2">
          {roles.length === 0 ? (
            <span className="text-sm">No roles assigned.</span>
          ) : (
            roles.map((r) => (
              <span
                key={r}
                className="text-xs uppercase tracking-wide rounded bg-primary/15 text-primary px-2 py-0.5"
              >
                {r}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
