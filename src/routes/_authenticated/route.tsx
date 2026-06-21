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
    return { user: data.user };
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
      zohoConnected={!!status.data?.connected}
      onSignOut={signOut}
      signingOut={signingOut}
    >
      <Outlet />
    </AppShell>
  );
}
