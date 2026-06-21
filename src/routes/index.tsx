import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    // Public landing → bounce signed-in users to the app, others to auth.
    // We can't read the session server-side (it lives in localStorage), so the
    // bounce happens client-side via the component below; loader stays a no-op.
  },
  component: Index,
});

function Index() {
  if (typeof window !== "undefined") {
    // Hard-redirect on the client. The _authenticated layout will gate further.
    window.location.replace("/dashboard");
  }
  return null;
}
