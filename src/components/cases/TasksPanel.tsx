/**
 * TasksPanel — tasks for an SSDI case (Phase 1.2).
 *
 * Lists open + (optionally) completed tasks, with per-row actions:
 *   - Complete / Reopen
 *   - Reassign (to any active Zoho user)
 * Plus an "Add task" form that creates a Task in Zoho linked to this case.
 *
 * Owner defaults to the case's Assigned_Attorney when stage-driven tasks are
 * created server-side; manual tasks default to the current Zoho user unless
 * an owner is explicitly selected.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2, RotateCcw, UserCog, Plus, AlertTriangle, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  completeTask, reopenTask, reassignTask, createCaseTask, getCaseTasks, listZohoUsers,
} from "@/lib/zoho.functions";

interface Props { caseId: string }

type TaskRow = {
  id?: string;
  Subject?: string;
  Status?: string;
  Priority?: string;
  Due_Date?: string;
  Owner?: { id?: string; name?: string } | string;
  Description?: string;
};

function ownerLabel(o: TaskRow["Owner"]): string {
  if (!o) return "Unassigned";
  if (typeof o === "string") return o;
  return o.name ?? o.id ?? "Unassigned";
}
function ownerId(o: TaskRow["Owner"]): string | undefined {
  if (!o) return undefined;
  if (typeof o === "string") return o;
  return o.id;
}

function daysFromToday(iso?: string): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y) return null;
  const due = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((due - today) / 86_400_000);
}

export function TasksPanel({ caseId }: Props) {
  const qc = useQueryClient();
  const fetchTasks = useServerFn(getCaseTasks);
  const fetchUsers = useServerFn(listZohoUsers);
  const complete = useServerFn(completeTask);
  const reopen = useServerFn(reopenTask);
  const reassign = useServerFn(reassignTask);
  const addTask = useServerFn(createCaseTask);

  const [showCompleted, setShowCompleted] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busyTask, setBusyTask] = useState<string | null>(null);

  const tasksQ = useQuery({
    queryKey: ["tasks", caseId],
    queryFn: () => fetchTasks({ data: { caseId } }),
  });

  // Users loaded lazily — needed for reassign / add-task pickers.
  const usersQ = useQuery({
    queryKey: ["zoho-users"],
    queryFn: () => fetchUsers(),
    staleTime: 5 * 60 * 1000,
  });
  const users = usersQ.data?.users ?? [];

  const rows = (tasksQ.data?.rows ?? []) as TaskRow[];
  const open = useMemo(() => rows.filter((r) => r.Status !== "Completed"), [rows]);
  const done = useMemo(() => rows.filter((r) => r.Status === "Completed"), [rows]);
  const visible = showCompleted ? [...open, ...done] : open;

  async function invalidate() {
    await qc.invalidateQueries({ queryKey: ["tasks", caseId] });
    await qc.invalidateQueries({ queryKey: ["case-activity", caseId] });
  }

  async function onComplete(id: string) {
    setBusyTask(id);
    try { await complete({ data: { taskId: id, caseId } }); await invalidate(); toast.success("Task completed."); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusyTask(null); }
  }
  async function onReopen(id: string) {
    setBusyTask(id);
    try { await reopen({ data: { taskId: id, caseId } }); await invalidate(); toast.success("Task reopened."); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusyTask(null); }
  }
  async function onReassign(id: string, ownerId: string) {
    setBusyTask(id);
    const ownerName = users.find((u) => u.id === ownerId)?.full_name;
    try { await reassign({ data: { taskId: id, ownerId, caseId, ownerName } }); await invalidate(); toast.success("Task reassigned."); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusyTask(null); }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Tasks</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowCompleted((v) => !v)}
          >
            {showCompleted ? "Hide completed" : `Show completed (${done.length})`}
          </button>
          <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        </div>
      </div>

      {adding && (
        <AddTaskForm
          users={users}
          busy={false}
          onCancel={() => setAdding(false)}
          onSubmit={async (form) => {
            await addTask({ data: { caseId, ...form } });
            await invalidate();
            toast.success("Task added.");
            setAdding(false);
          }}
        />
      )}

      {tasksQ.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {!tasksQ.isLoading && visible.length === 0 && (
        <p className="text-xs text-muted-foreground">No {showCompleted ? "" : "open "}tasks.</p>
      )}

      <ul className="space-y-2">
        {visible.map((t) => {
          const id = String(t.id ?? "");
          const isDone = t.Status === "Completed";
          const days = daysFromToday(t.Due_Date);
          const overdue = !isDone && days !== null && days < 0;
          const soon = !isDone && days !== null && days >= 0 && days <= 3;

          return (
            <li
              key={id}
              className={`flex items-start justify-between gap-2 border-b border-border/50 pb-2 last:border-0 ${
                isDone ? "opacity-60" : ""
              }`}
            >
              <div className="min-w-0">
                <div className={`text-sm ${isDone ? "line-through" : ""}`}>{t.Subject ?? "—"}</div>
                <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                  <span>{t.Due_Date ? `Due ${t.Due_Date}` : "No due date"}</span>
                  {days !== null && !isDone && (
                    <span className={overdue ? "text-destructive font-medium" : soon ? "text-amber-600 dark:text-amber-400" : ""}>
                      {overdue ? `· ${Math.abs(days)}d overdue` : days === 0 ? "· today" : `· in ${days}d`}
                    </span>
                  )}
                  <span>· {ownerLabel(t.Owner)}</span>
                  {t.Priority && t.Priority !== "Normal" && <span>· {t.Priority}</span>}
                  {overdue && <AlertTriangle className="h-3 w-3 text-destructive" />}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="ghost" disabled={busyTask === id} aria-label="Reassign">
                      <UserCog className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64 p-2">
                    <div className="text-xs font-medium px-2 pb-1 text-muted-foreground">Reassign to</div>
                    <div className="max-h-64 overflow-y-auto">
                      {usersQ.isLoading && (
                        <div className="px-2 py-3 text-xs text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" /> Loading users…
                        </div>
                      )}
                      {users.map((u) => {
                        const current = ownerId(t.Owner) === u.id;
                        return (
                          <button
                            key={u.id}
                            type="button"
                            disabled={current}
                            onClick={() => onReassign(id, u.id)}
                            className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent ${
                              current ? "bg-accent/50 text-muted-foreground" : ""
                            }`}
                          >
                            {u.full_name}
                            {current && <span className="text-xs ml-1">(current)</span>}
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
                {isDone ? (
                  <Button size="sm" variant="ghost" onClick={() => onReopen(id)} disabled={busyTask === id}>
                    <RotateCcw className="h-4 w-4 mr-1" /> Reopen
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => onComplete(id)} disabled={busyTask === id}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Done
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AddTaskForm(props: {
  users: Array<{ id: string; full_name: string }>;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (data: {
    subject: string;
    dueDate?: string;
    priority?: "Low" | "Normal" | "High" | "Highest";
    ownerId?: string;
  }) => Promise<void>;
}) {
  const [subject, setSubject] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<"Low" | "Normal" | "High" | "Highest">("Normal");
  const [ownerId, setOwnerId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!subject.trim()) return;
    setBusy(true);
    try {
      await props.onSubmit({
        subject: subject.trim(),
        dueDate: dueDate || undefined,
        priority,
        ownerId: ownerId || undefined,
      });
      setSubject(""); setDueDate(""); setPriority("Normal"); setOwnerId("");
    } finally { setBusy(false); }
  }

  return (
    <div className="mb-3 rounded-md border bg-muted/30 p-3 space-y-2">
      <div>
        <Label className="text-xs">Subject</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 h-8 text-sm" autoFocus />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Due</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as "Low" | "Normal" | "High" | "Highest")}>
            <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Low">Low</SelectItem>
              <SelectItem value="Normal">Normal</SelectItem>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Highest">Highest</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Owner</Label>
          <Select value={ownerId || "__me__"} onValueChange={(v) => setOwnerId(v === "__me__" ? "" : v)}>
            <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__me__">Me (default)</SelectItem>
              {props.users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={props.onCancel} disabled={busy}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={busy || !subject.trim()}>
          {busy ? "Adding…" : "Add task"}
        </Button>
      </div>
    </div>
  );
}
