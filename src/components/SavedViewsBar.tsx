/**
 * SavedViewsBar.tsx — capture and recall named filter presets on a list page.
 *
 * Generic: caller passes the current filter values (`params`) and gets back a
 * change handler when the user picks a saved preset. Page-scoped by `page`.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSavedViews, upsertSavedView, deleteSavedView, type SavedView } from "@/lib/savedViews.functions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Bookmark, BookmarkPlus, X } from "lucide-react";
import { toast } from "sonner";

interface Props<P> {
  page: string;
  params: P;
  onApply: (params: P) => void;
}

export function SavedViewsBar<P extends Record<string, unknown>>({ page, params, onApply }: Props<P>) {
  const qc = useQueryClient();
  const listFn = useServerFn(listSavedViews);
  const upsertFn = useServerFn(upsertSavedView);
  const deleteFn = useServerFn(deleteSavedView);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const views = useQuery({
    queryKey: ["saved-views", page],
    queryFn: () => listFn({ data: { page } }),
  });

  const save = useMutation({
    mutationFn: () => upsertFn({ data: { page, name: name.trim(), params } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-views", page] });
      toast.success(`Saved view "${name.trim()}"`);
      setNaming(false); setName("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save view"),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-views", page] }),
  });

  const list: SavedView[] = views.data?.views ?? [];

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Bookmark className="h-3.5 w-3.5" />
            Saved views{list.length > 0 ? ` (${list.length})` : ""}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Your saved views</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {list.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">None yet — apply filters, then save.</div>
          )}
          {list.map((v) => (
            <DropdownMenuItem
              key={v.id}
              onSelect={() => onApply(v.params as P)}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate">{v.name}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); del.mutate(v.id); }}
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Delete ${v.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {naming ? (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            placeholder="View name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) save.mutate(); if (e.key === "Escape") { setNaming(false); setName(""); } }}
            className="h-8 w-40"
          />
          <Button size="sm" onClick={() => name.trim() && save.mutate()} disabled={!name.trim() || save.isPending}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setNaming(false); setName(""); }}>Cancel</Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setNaming(true)}>
          <BookmarkPlus className="h-3.5 w-3.5" />
          Save view
        </Button>
      )}
    </div>
  );
}
