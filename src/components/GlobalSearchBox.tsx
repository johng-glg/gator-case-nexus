/**
 * GlobalSearchBox.tsx — inline header search across SSDI cases, contacts,
 * leads, and engagements. Renders a floating dropdown under the input.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Search, FolderOpen, User, UserPlus, Briefcase, Loader2 } from "lucide-react";
import { zohoQuery } from "@/lib/zoho.functions";
import { cn } from "@/lib/utils";

type Hit =
  | { kind: "case"; id: string; title: string; sub?: string }
  | { kind: "contact"; id: string; title: string; sub?: string }
  | { kind: "lead"; id: string; title: string; sub?: string }
  | { kind: "engagement"; id: string; title: string; sub?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rows(res: any): any[] {
  return (res?.rows ?? []) as any[];
}

function fullName(r: { First_Name?: string; Last_Name?: string }) {
  return [r.First_Name, r.Last_Name].filter(Boolean).join(" ").trim();
}

export function GlobalSearchBox() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const runQuery = useServerFn(zohoQuery);

  // Debounced search across modules.
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const term = q.trim();
      const names: Array<{ name: "ssdiCaseSearch" | "contactSearch" | "leadSearch" | "engagementSearch" }> = [
        { name: "ssdiCaseSearch" },
        { name: "contactSearch" },
        { name: "leadSearch" },
        { name: "engagementSearch" },
      ];
      const results = await Promise.all(
        names.map((n) =>
          runQuery({ data: { name: n.name, params: { q: term } } }).catch(() => ({ rows: [] })),
        ),
      );
      if (cancelled) return;
      const [cases, contacts, leads, engs] = results;
      const out: Hit[] = [];
      for (const r of rows(cases).slice(0, 5)) {
        out.push({
          kind: "case",
          id: r.id,
          title: r.Case_Number ?? r.id,
          sub: r.Current_Stage,
        });
      }
      for (const r of rows(contacts).slice(0, 5)) {
        out.push({
          kind: "contact",
          id: r.id,
          title: fullName(r) || r.Email || r.id,
          sub: r.Email,
        });
      }
      for (const r of rows(leads).slice(0, 5)) {
        out.push({
          kind: "lead",
          id: r.id,
          title: fullName(r) || r.Company || r.Email || r.id,
          sub: r.Lead_Status ?? r.Email,
        });
      }
      for (const r of rows(engs).slice(0, 5)) {
        out.push({
          kind: "engagement",
          id: r.id,
          title: r.Name ?? r.id,
          sub: r.Engagement_Type,
        });
      }
      setHits(out);
      setActive(0);
      setSearching(false);
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, runQuery]);

  // Outside click closes dropdown.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function go(h: Hit) {
    setOpen(false);
    setQ("");
    setHits([]);
    switch (h.kind) {
      case "case":
        navigate({ to: "/practices/ssdi/cases/$caseId", params: { caseId: h.id } });
        return;
      case "contact":
        navigate({ to: "/clients/$clientId", params: { clientId: h.id } });
        return;
      case "lead":
        navigate({ to: "/leads/$leadId", params: { leadId: h.id } });
        return;
      case "engagement":
        navigate({ to: "/engagements/$engagementId", params: { engagementId: h.id } });
        return;
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); return; }
    if (!hits.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % hits.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + hits.length) % hits.length); }
    else if (e.key === "Enter") { e.preventDefault(); go(hits[active]); }
  }

  const grouped = useMemo(() => {
    const g: Record<Hit["kind"], Hit[]> = { case: [], contact: [], lead: [], engagement: [] };
    hits.forEach((h) => g[h.kind].push(h));
    return g;
  }, [hits]);

  const showDropdown = open && q.trim().length >= 2;
  let flatIdx = -1;

  return (
    <div ref={rootRef} className="relative w-full max-w-[320px]">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="Search cases, clients, leads…"
          className="w-full h-8 pl-8 pr-8 rounded-md bg-background/60 border border-border text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40"
        />
        {searching && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
        )}
      </div>

      {showDropdown && (
        <div className="absolute right-0 left-0 mt-1 z-50 max-h-[60vh] overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {hits.length === 0 && !searching && (
            <div className="px-3 py-3 text-xs text-muted-foreground">No matches</div>
          )}
          {hits.length === 0 && searching && (
            <div className="px-3 py-3 text-xs text-muted-foreground">Searching…</div>
          )}
          {(["case", "contact", "lead", "engagement"] as const).map((kind) => {
            const items = grouped[kind];
            if (!items.length) return null;
            const heading = {
              case: "SSDI cases",
              contact: "Clients",
              lead: "Leads",
              engagement: "Engagements",
            }[kind];
            const Icon = { case: FolderOpen, contact: User, lead: UserPlus, engagement: Briefcase }[kind];
            return (
              <div key={kind} className="py-1">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  {heading}
                </div>
                {items.map((h) => {
                  flatIdx += 1;
                  const isActive = flatIdx === active;
                  return (
                    <button
                      key={`${h.kind}-${h.id}`}
                      type="button"
                      // eslint-disable-next-line react-hooks/exhaustive-deps
                      onMouseEnter={() => setActive(hits.indexOf(h))}
                      onClick={() => go(h)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-left text-sm",
                        isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium truncate">{h.title}</span>
                      {h.sub && (
                        <span className="ml-auto text-xs text-muted-foreground truncate">{h.sub}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
