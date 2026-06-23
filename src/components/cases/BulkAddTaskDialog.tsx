/**
 * BulkAddTaskDialog.tsx — bulk-create the same task across multiple SSDI cases.
 *
 * Fires one createCaseTask per selected case. Reports the count of successes
 * and failures via toast; never blocks on a single failure.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createCaseTask, listZohoUsers } from "@/lib/zoho.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseIds: string[];
  onComplete?: () => void;
}

export function BulkAddTaskDialog({ open, onOpenChange, caseIds, onComplete }: Props) {
  const [subject, setSubject] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);

  const createFn = useServerFn(createCaseTask);
  const usersFn = useServerFn(listZohoUsers);
  const users = useQuery({
    queryKey: ["zoho-users"],
    queryFn: () => usersFn(),
    enabled: open,
  });

  async function submit() {
    const trimmed = subject.trim();
    if (!trimmed || caseIds.length === 0) return;
    setPending(true);
    let ok = 0;
    let failed = 0;
    for (const caseId of caseIds) {
      try {
        await createFn({
          data: {
            caseId,
            subject: trimmed,
            dueDate: dueDate || undefined,
            ownerId: ownerId || undefined,
            description: description.trim() || undefined,
          },
        });
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    setPending(false);
    if (ok > 0) toast.success(`Created ${ok} task${ok === 1 ? "" : "s"}${failed ? ` · ${failed} failed` : ""}`);
    else toast.error("Failed to create tasks");
    setSubject(""); setDueDate(""); setOwnerId(""); setDescription("");
    onOpenChange(false);
    onComplete?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add task to {caseIds.length} case{caseIds.length === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>
            The same task will be created on every selected case.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Subject *</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Call client to confirm hearing" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Due date</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Assign to</label>
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">— Default owner —</option>
                {users.data?.users?.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name ?? u.email ?? u.id}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Notes</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !subject.trim() || caseIds.length === 0}>
            {pending ? "Creating…" : `Create ${caseIds.length} task${caseIds.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
