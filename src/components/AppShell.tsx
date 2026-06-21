import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Briefcase,
  AlarmClock,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Scale,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PRACTICES } from "@/practices/registry";

interface Props {
  userEmail: string;
  zohoConnected: boolean;
  onSignOut: () => void;
  signingOut: boolean;
  children: ReactNode;
}

const FIRM_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/leads", label: "Leads", icon: UserPlus },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/engagements", label: "Engagements", icon: Briefcase },
  { to: "/deadlines", label: "Deadlines", icon: AlarmClock },
] as const;

export function AppShell({ userEmail, zohoConnected, onSignOut, signingOut, children }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-60 shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-border">
          <div className="h-8 w-8 rounded-md bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
            <Scale className="h-4 w-4 text-primary" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-lg text-primary">Gator</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Case platform
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-5">
          <NavGroup label="Firm-wide">
            {FIRM_NAV.map((n) => {
              const active = pathname === n.to || pathname.startsWith(n.to + "/");
              const Icon = n.icon;
              return (
                <NavLink key={n.to} to={n.to} active={active}>
                  <Icon className="h-4 w-4" />
                  {n.label}
                </NavLink>
              );
            })}
          </NavGroup>

          <NavGroup label="Practice areas">
            {PRACTICES.map((p) => {
              const to = `/practices/${p.slug}`;
              const active = pathname === to || pathname.startsWith(to + "/");
              if (!p.active) {
                return (
                  <div
                    key={p.slug}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground/60 cursor-not-allowed"
                    title="Coming soon"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    <span className="flex-1">{p.label}</span>
                    <span className="text-[9px] uppercase tracking-wider">soon</span>
                  </div>
                );
              }
              return (
                <NavLink key={p.slug} to={to} active={active}>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                  {p.label}
                </NavLink>
              );
            })}
          </NavGroup>
        </nav>

        <div className="p-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={onSignOut}
            disabled={signingOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-card/40 backdrop-blur flex items-center justify-between px-6">
          <div className="text-sm text-muted-foreground truncate">{userEmail}</div>
          <ZohoStatusPill connected={zohoConnected} />
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="px-3 pb-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavLink({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-accent text-primary font-medium"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function ZohoStatusPill({ connected }: { connected: boolean }) {
  if (connected) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
        Zoho connected
      </div>
    );
  }
  return (
    <Link
      to="/connect-zoho"
      className="inline-flex items-center gap-1.5 rounded-full border border-destructive/50 bg-destructive/10 px-2.5 py-1 text-xs text-destructive-foreground hover:bg-destructive/20"
    >
      <AlertTriangle className="h-3.5 w-3.5" />
      Connect Zoho
    </Link>
  );
}
