/**
 * GlobalSearchBox.tsx — inline header search for SSDI cases.
 * Renders a floating dropdown directly under the input (no modal).
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Search, FolderOpen, Loader2 } from "lucide-react";
import { zohoQuery } from "@/lib/zoho.functions";
import { cn } from "@/lib/utils";

type CaseHit = { id: string; Case_Number?: string; Current_Stage?: string };

export function GlobalSearchBox() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<CaseHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const runQuery = useServerFn(zohoQuery);

  // Debounced search.
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await runQuery({ data: { name: "ssdiCaseSearch", params: { q: q.trim() } } });
        if (!cancelled) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setHits((((res as any)?.rows ?? []) as CaseHit[]).slice(0, 8));
          setActive(0);
        }
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);
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

  function go(h: CaseHit) {
    setOpen(false);
    setQ("");
    setHits([]);
    navigate({ to: "/practices/ssdi/cases/$caseId", params: { caseId: h.id } });
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); return; }
    if (!hits.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % hits.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + hits.length) % hits.length); }
    else if (e.key === "Enter") { e.preventDefault(); go(hits[active]); }
  }

  const showDropdown = open && q.trim().length >= 2;

  return (
    <div ref={rootRef} className="relative w-full max-w-[280px]">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="Search SSDI cases…"
          className="w-full h-8 pl-8 pr-8 rounded-md bg-background/60 border border-border text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40"
        />
        {searching && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
        )}
      </div>

      {showDropdown && (
        <div className="absolute right-0 left-0 mt-1 z-50 rounded-md border border-border bg-popover shadow-lg overflow-hidden">
          {hits.length === 0 && !searching && (
            <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
          )}
          {hits.length === 0 && searching && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
          )}
          {hits.map((h, i) => (
            <button
              key={h.id}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => go(h)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-left text-sm",
                i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
              )}
            >
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium truncate">{h.Case_Number ?? h.id}</span>
              {h.Current_Stage && (
                <span className="ml-auto text-xs text-muted-foreground truncate">{h.Current_Stage}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
