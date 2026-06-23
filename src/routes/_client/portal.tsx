/**
 * /portal — Parent layout for the client portal.
 *
 * Child routes such as /portal/$matterId and /portal/intake must render through
 * this route's Outlet. The landing page itself lives at portal.index.tsx.
 */
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_client/portal")({
  head: () => ({ meta: [{ title: "Your matters — Gator Law" }] }),
  component: PortalLayout,
});

function PortalLayout() {
  return <Outlet />;
}
