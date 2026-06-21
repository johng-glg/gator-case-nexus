import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createLead, zohoQuery } from "@/lib/zoho.functions";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leads/")({
  head: () => ({ meta: [{ title: "Leads — Gator" }] }),
  component: Leads,
});

const PRACTICES = ["All", "SSDI", "FCRA", "FDCPA", "TCPA", "Class Action"] as const;
const STATUSES = ["Default", "All", "New", "Qualified", "Converted", "Disqualified"] as const;
type Practice = (typeof PRACTICES)[number];
type Status = (typeof STATUSES)[number];

const PRACTICE_CHIP: Record<string, string> = {
  SSDI: "bg-primary/15 text-primary border-primary/30",
  FCRA: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  FDCPA: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  TCPA: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  "Class Action": "bg-fuchsia-500/15 text-fuchsia-600 border-fuchsia-500/30",
};

const STATUS_CHIP: Record<string, string> = {
  New: "bg-muted text-muted-foreground border-border",
  Qualified: "bg-primary/15 text-primary border-primary/30",
  Converted: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  Disqualified: "bg-destructive/10 text-destructive border-destructive/30",
};

function Leads() {
  const runQuery = useServerFn(zohoQuery);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [practice, setPractice] = useState<Practice>(() =>
    (localStorage.getItem("leads.practice") as Practice) || "All",
  );
  const [status, setStatus] = useState<Status>(() => {
    const v = localStorage.getItem("leads.status") as Status | null;
    return v && v !== "Default" ? v : "All";
  });
  useEffect(() => { localStorage.setItem("leads.practice", practice); }, [practice]);
  useEffect(() => { localStorage.setItem("leads.status", status); }, [status]);

  const leads = useQuery({
    queryKey: ["allLeads"],
    queryFn: () => runQuery({ data: { name: "allLeads" } }),
  });

  const filtered = useMemo(() => {
    const rows = leads.data?.rows ?? [];
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      const rp = String(r.Practice_Area ?? "");
      if (practice !== "All" && rp !== practice) return false;
      const rs = String(r.Lead_Status ?? "");
      if (status === "Default") {
        if (rs !== "New" && rs !== "Qualified") return false;
      } else if (status !== "All" && rs !== status) return false;
      if (!needle) return true;
      const hay = [
        r.First_Name, r.Last_Name, r.Email, r.Phone, r.Mobile, r.Company,
        r.Lead_Status, r.Lead_Source, r.Practice_Area,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [leads.data, q, practice, status]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-5">
      <div className="flex items-baseline justify-between flex-wrap gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl text-foreground">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One pipeline across all practice areas. Qualify, then convert into an engagement.
          </p>
        </div>
        <div className="flex w-full sm:w-auto items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, source…"
            className="flex-1 sm:w-64 rounded-md border border-border bg-input px-3 py-1.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            onClick={() => setOpenNew(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New lead</span><span className="sm:hidden">New</span>
          </button>

        </div>
      </div>

      <NewLeadDialog
        open={openNew}
        onOpenChange={setOpenNew}
        defaultPractice={practice === "All" ? undefined : (practice as Exclude<Practice, "All">)}
        onCreated={(id) => {
          qc.invalidateQueries({ queryKey: ["allLeads"] });
          setOpenNew(false);
          navigate({ to: "/leads/$leadId", params: { leadId: id } });
        }}
      />

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <FilterGroup label="Practice" value={practice} options={PRACTICES} onChange={setPractice} />
        <FilterGroup label="Status" value={status} options={STATUSES} onChange={setStatus} />
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <Th>Name</Th>
              <Th>Practice</Th>
              <Th>Status</Th>
              <Th>Source</Th>
              <Th>Owner</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {leads.isLoading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {leads.error && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-destructive-foreground">
                {(leads.error as Error).message}
              </td></tr>
            )}
            {leads.data && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No leads match.</td></tr>
            )}
            {filtered.map((r) => {
              const id = String((r as Record<string, unknown>).id ?? "");
              const name = [r.First_Name, r.Last_Name].filter(Boolean).join(" ") || "—";
              const owner = (r.Owner as { name?: string } | null)?.name ?? "—";
              const created = String(r.Created_Time ?? "").slice(0, 10);
              const p = String(r.Practice_Area ?? "");
              const s = String(r.Lead_Status ?? "");
              return (
                <tr key={id} className="hover:bg-accent/30">
                  <Td>
                    <Link
                      to="/leads/$leadId"
                      params={{ leadId: id }}
                      className="font-medium text-primary hover:underline"
                    >
                      {name}
                    </Link>
                  </Td>
                  <Td>{p ? <Chip cls={PRACTICE_CHIP[p] ?? "border-border text-muted-foreground"}>{p}</Chip> : <span className="text-muted-foreground">—</span>}</Td>
                  <Td>{s ? <Chip cls={STATUS_CHIP[s] ?? "border-border text-muted-foreground"}>{s}</Chip> : <span className="text-muted-foreground">—</span>}</Td>
                  <Td className="text-muted-foreground">{String(r.Lead_Source ?? "—")}</Td>
                  <Td className="text-muted-foreground">{owner}</Td>
                  <Td className="text-muted-foreground">{created || "—"}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterGroup<T extends string>({
  label, value, options, onChange,
}: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground mr-1">{label}</span>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
            value === o
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-border bg-background hover:bg-muted/40 text-muted-foreground",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Chip({ children, cls }: { children: React.ReactNode; cls: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", cls)}>
      {children}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 text-left font-medium">{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3", className)}>{children}</td>;
}




type PracticeChoice = "SSDI" | "FCRA" | "FDCPA" | "TCPA" | "Class Action";
const PRACTICE_CHOICES: PracticeChoice[] = ["SSDI", "FCRA", "FDCPA", "TCPA", "Class Action"];

function NewLeadDialog({
  open, onOpenChange, defaultPractice, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultPractice?: PracticeChoice;
  onCreated: (id: string) => void;
}) {
  const createFn = useServerFn(createLead);
  const [form, setForm] = useState({
    First_Name: "", Last_Name: "", Email: "", Phone: "", Mobile: "",
    Lead_Source: "", Description: "",
    Practice_Area: (defaultPractice ?? "SSDI") as PracticeChoice,
  });
  useEffect(() => {
    if (open) {
      setForm((f) => ({ ...f, Practice_Area: defaultPractice ?? "SSDI" }));
    }
  }, [open, defaultPractice]);

  const m = useMutation({
    mutationFn: (payload: typeof form) => createFn({ data: payload }),
    onSuccess: (res) => {
      toast.success("Lead created");
      onCreated(res.id);
      setForm({
        First_Name: "", Last_Name: "", Email: "", Phone: "", Mobile: "",
        Lead_Source: "", Description: "",
        Practice_Area: defaultPractice ?? "SSDI",
      });
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed to create lead"),
  });

  const upd = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.Last_Name.trim()) {
      toast.error("Last name is required");
      return;
    }
    m.mutate(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New lead</DialogTitle>
          <DialogDescription>Quick capture. You can qualify and convert later.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <LField label="First name">
              <input value={form.First_Name} onChange={upd("First_Name")} maxLength={100} className={inputCls} />
            </LField>
            <LField label="Last name *">
              <input value={form.Last_Name} onChange={upd("Last_Name")} required maxLength={100} className={inputCls} />
            </LField>
            <LField label="Email">
              <input type="email" value={form.Email} onChange={upd("Email")} maxLength={255} className={inputCls} />
            </LField>
            <LField label="Phone">
              <input value={form.Phone} onChange={upd("Phone")} maxLength={40} className={inputCls} />
            </LField>
            <LField label="Mobile">
              <input value={form.Mobile} onChange={upd("Mobile")} maxLength={40} className={inputCls} />
            </LField>
            <LField label="Source">
              <input value={form.Lead_Source} onChange={upd("Lead_Source")} maxLength={100} placeholder="Web, Referral…" className={inputCls} />
            </LField>
            <LField label="Practice area">
              <select value={form.Practice_Area} onChange={upd("Practice_Area")} className={inputCls}>
                {PRACTICE_CHOICES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </LField>
          </div>
          <LField label="Notes">
            <textarea value={form.Description} onChange={upd("Description")} rows={3} maxLength={2000} className={cn(inputCls, "resize-none")} />
          </LField>
          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/40"
            >Cancel</button>
            <button
              type="submit"
              disabled={m.isPending || !form.Last_Name.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {m.isPending ? "Creating…" : "Create lead"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const inputCls = "w-full rounded-md border border-border bg-input px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function LField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

