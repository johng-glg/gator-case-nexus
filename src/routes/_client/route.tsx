/**
 * /_client — Pathless layout for the client portal. Mirrors _authenticated but
 * with the inverse domain rule: signed-in NON-firm emails only. Firm staff are
 * bounced back to /dashboard so they can't masquerade as a client.
 */
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const FIRM_DOMAIN = "gatorlawpc.com";

export const Route = createFileRoute("/_client")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/client-auth" });
    const email = (data.user.email ?? "").toLowerCase();
    if (email.endsWith(`@${FIRM_DOMAIN}`)) {
      throw redirect({ to: "/dashboard" });
    }
    return { user: data.user };
  },
  component: ClientLayout,
});

function ClientLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Outlet />
    </div>
  );
}
