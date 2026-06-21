import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/practices/ssdi/")({
  beforeLoad: () => {
    throw redirect({ to: "/practices/ssdi/cases" });
  },
});
