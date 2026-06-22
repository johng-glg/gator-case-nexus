/**
 * CommandPalette.tsx — global ⌘K / Ctrl+K palette.
 *
 * Quick-nav (Dashboard, Today, Deadlines, Leads, Clients, Engagements, Settings),
 * plus on-demand SSDI case search by Case_Number via the zohoQuery whitelist.
 * Mount once in the authenticated layout.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  AlarmClock,
  Briefcase,
  UserPlus,
  Users,
  Settings,
  Sun,
  FolderOpen,
} from "lucide-react";
import { zohoQuery } from "@/lib/zoho.functions";

type CaseHit = { id: string; Case_Number?: string; Current_Stage?: string };

const NAV = [
  { to: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/today", label: "Today", Icon: Sun },
  { to: "/deadlines", label: "Deadlines", Icon: AlarmClock },
  { to: "/leads", label: "Leads", Icon: UserPlus },
  { to: "/clients", label: "Clients", Icon: Users },
  { to: "/engagements", label: "Engagements", Icon: Briefcase },
  { to: "/practices/ssdi/cases", label: "SSDI cases", Icon: FolderOpen },
  { to: "/settings", label: "Settings", Icon: Settings },
] as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CaseHit[]>([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();
  const runQuery = useServerFn(zohoQuery);

  // Global keyboard shortcut.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset on close.
  useEffect(() => {
    if (!open) { setQ(""); setHits([]); }
  }, [open]);

  // Debounced case search.
  useEffect(() => {
    if (!open || q.trim().length < 2) { setHits([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await runQuery({ data: { name: "ssdiCaseSearch", params: { q: q.trim() } } });
        if (!cancelled) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setHits(((res as any)?.rows ?? []).slice(0, 8));
        }
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, open, runQuery]);

  function go(to: string) {
    setOpen(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate({ to: to as any });
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search cases, jump to a page… (⌘K)" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>{searching ? "Searching…" : "No results."}</CommandEmpty>

        {hits.length > 0 && (
          <CommandGroup heading="SSDI cases">
            {hits.map((h) => (
              <CommandItem
                key={h.id}
                value={`case-${h.id}`}
                onSelect={() => go(`/practices/ssdi/cases/${h.id}`)}
              >
                <FolderOpen className="mr-2 h-4 w-4" />
                <span className="font-medium">{h.Case_Number ?? h.id}</span>
                {h.Current_Stage && (
                  <span className="ml-2 text-xs text-muted-foreground">{h.Current_Stage}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {hits.length > 0 && <CommandSeparator />}

        <CommandGroup heading="Jump to">
          {NAV.map(({ to, label, Icon }) => (
            <CommandItem key={to} value={`nav-${label}`} onSelect={() => go(to)}>
              <Icon className="mr-2 h-4 w-4" />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
