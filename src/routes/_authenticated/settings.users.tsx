import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  inviteUser,
  listUsers,
  setUserRole,
  type AdminUser,
} from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/settings/users")({
  component: UsersPage,
});

function UsersPage() {
  const qc = useQueryClient();
  const fetchUsers = useServerFn(listUsers);
  const mutateRole = useServerFn(setUserRole);
  const mutateInvite = useServerFn(inviteUser);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(),
  });

  const roleMutation = useMutation({
    mutationFn: (vars: { userId: string; role: "admin" | "staff"; grant: boolean }) =>
      mutateRole({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
    onError: (e: any) => toast.error(e.message ?? "Failed to update role"),
  });

  const inviteMutation = useMutation({
    mutationFn: (vars: { email: string; asAdmin: boolean }) =>
      mutateInvite({ data: vars }),
    onSuccess: () => {
      toast.success("Invite sent");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to invite"),
  });

  if (error) {
    return (
      <div className="rounded border border-destructive/40 bg-destructive/10 p-4 text-sm">
        {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <InviteForm
        onSubmit={(vals) => inviteMutation.mutate(vals)}
        pending={inviteMutation.isPending}
      />

      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border text-sm font-medium">
          Users ({data?.length ?? 0})
        </div>
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Last sign-in</th>
                <th className="px-4 py-2">Admin</th>
                <th className="px-4 py-2">Staff</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((u: AdminUser) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-3">{u.email ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.last_sign_in_at
                      ? new Date(u.last_sign_in_at).toLocaleDateString()
                      : "never"}
                  </td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={u.roles.includes("admin")}
                      disabled={roleMutation.isPending}
                      onCheckedChange={(checked) =>
                        roleMutation.mutate({
                          userId: u.id,
                          role: "admin",
                          grant: checked,
                        })
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={u.roles.includes("staff")}
                      disabled={roleMutation.isPending}
                      onCheckedChange={(checked) =>
                        roleMutation.mutate({
                          userId: u.id,
                          role: "staff",
                          grant: checked,
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function InviteForm({
  onSubmit,
  pending,
}: {
  onSubmit: (v: { email: string; asAdmin: boolean }) => void;
  pending: boolean;
}) {
  const [email, setEmail] = useState("");
  const [asAdmin, setAsAdmin] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!email) return;
        onSubmit({ email, asAdmin });
        setEmail("");
        setAsAdmin(false);
      }}
      className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-end gap-3"
    >
      <div className="flex-1 min-w-[220px]">
        <Label htmlFor="email">Invite user by email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@firm.com"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={asAdmin} onCheckedChange={setAsAdmin} />
        Admin
      </label>
      <Button type="submit" disabled={pending || !email}>
        {pending ? "Sending…" : "Send invite"}
      </Button>
    </form>
  );
}
