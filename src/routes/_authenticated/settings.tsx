import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { myRoles } from "@/lib/users.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  const fetchRoles = useServerFn(myRoles);
  const { data: roles = [] } = useQuery({
    queryKey: ["my-roles"],
    queryFn: () => fetchRoles(),
  });
  const isAdmin = roles.includes("admin");
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const tabs = [
    { to: "/settings", label: "Overview", exact: true },
    ...(isAdmin
      ? [
          { to: "/settings/users", label: "Users & Roles", exact: false },
          { to: "/settings/connections", label: "Connections", exact: false },
          { to: "/settings/deadline-sweep", label: "Deadline Sweep", exact: false },
          { to: "/settings/stage-requirements", label: "Stage Requirements", exact: false },
          { to: "/settings/messaging", label: "Messaging", exact: false },
          { to: "/settings/trust-export", label: "Trust Export", exact: false },
          { to: "/settings/activity", label: "Activity Log", exact: false },
          { to: "/settings/changelog", label: "Change Log", exact: false },
        ]
      : []),
  ];

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-display">Settings</h1>
        <p className="text-sm text-muted-foreground">Firm configuration and access control.</p>
      </div>
      <nav className="flex gap-1 border-b border-border">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
