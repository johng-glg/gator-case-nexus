/**
 * Authenticated layout. Gates client-side on session + Workspace domain,
 * then renders the shell (sidebar + topbar). Redirects to /connect-zoho if
 * the user hasn't completed the per-user Zoho OAuth grant yet.
 */
import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getConnectionStatus } from "@/lib/zoho.functions";
import { AppShell } from "@/components/AppShell";

const ALLOWED_DOMAIN = "gatorlawpc.com";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const email = data.user.email ?? "";
    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    // Load this user's app_role rows (RLS allows reading own).
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const roles = ((roleRows ?? []) as Array<{ role: "admin" | "staff" }>).map(
      (r) => r.role,
    );
    // Anyone reaching the firm shell must hold staff OR admin. Domain check
    // above already filters portal clients, but this is the defense-in-depth
    // rule the server-side asserts also enforce.
    if (!roles.includes("staff") && !roles.includes("admin")) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    return { user: data.user, roles };
  },
  component: AuthedLayout,
});


function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fetchStatus = useServerFn(getConnectionStatus);
  const [signingOut, setSigningOut] = useState(false);

  const status = useQuery({
    queryKey: ["zoho-connection"],
    queryFn: () => fetchStatus(),
    staleTime: 30_000,
  });

  // Gate every page behind a completed Zoho connection (except the connect page).
  useEffect(() => {
    if (status.data && !status.data.connected && pathname !== "/connect-zoho") {
      navigate({ to: "/connect-zoho", replace: true });
    }
  }, [status.data, pathname, navigate]);

  async function signOut() {
    setSigningOut(true);
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <AppShell
      userEmail={user.email ?? ""}
      onSignOut={signOut}
      signingOut={signingOut}
    >
      <Outlet />
    </AppShell>
  );
}
