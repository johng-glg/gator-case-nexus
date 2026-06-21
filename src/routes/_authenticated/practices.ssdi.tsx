import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/practices/ssdi")({
  component: () => <Outlet />,
});
