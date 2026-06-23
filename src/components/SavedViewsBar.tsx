/**
 * SavedViewsBar.tsx — capture and recall named filter presets on a list page.
 *
 * Supports firm-wide sharing: any staff member can apply a shared preset, but
 * only the owner can rename, share/unshare, or delete it.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listSavedViews,
  upsertSavedView,
  deleteSavedView,
  setSavedViewSharing,
  type SavedView,
} from "@/lib/savedViews.functions";
import { supabase } from "@/integrations/supabase/client";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Bookmark, BookmarkPlus, Share2, X, Users } from "lucide-react";
import { toast } from "sonner";
import { useEffect } from "react";

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
  const shareFn = useServerFn(setSavedViewSharing);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [shareNew, setShareNew] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setMyUserId(data.user?.id ?? null);
    });
    return () => { cancelled = true; };
  }, []);

  const views = useQuery({
    queryKey: ["saved-views", page],
    queryFn: () => listFn({ data: { page } }),
  });

  const save = useMutation({
    mutationFn: () => upsertFn({ data: { page, name: name.trim(), params, shared_with_firm: shareNew } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-views", page] });
      toast.success(`Saved view "${name.trim()}"${shareNew ? " (shared)" : ""}`);
      setNaming(false); setName(""); setShareNew(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save view"),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-views", page] }),
  });

  const share = useMutation({
    mutationFn: (v: { id: string; shared: boolean }) => shareFn({ data: v }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["saved-views", page] });
      toast.success(v.shared ? "Shared with firm" : "Unshared");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update sharing"),
  });

  const list: SavedView[] = views.data?.views ?? [];
  const mine = list.filter((v) => v.user_id === myUserId);
  const firm = list.filter((v) => v.user_id !== myUserId && v.shared_with_firm);

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Bookmark className="h-3.5 w-3.5" />
            Saved views{list.length > 0 ? ` (${list.length})` : ""}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Your saved views</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {mine.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">None yet — apply filters, then save.</div>
          )}
          {mine.map((v) => (
            <DropdownMenuItem
              key={v.id}
              onSelect={() => onApply(v.params as P)}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate flex-1">{v.name}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); share.mutate({ id: v.id, shared: !v.shared_with_firm }); }}
                className={v.shared_with_firm ? "text-primary" : "text-muted-foreground hover:text-foreground"}
                aria-label={v.shared_with_firm ? `Unshare ${v.name}` : `Share ${v.name} with firm`}
                title={v.shared_with_firm ? "Shared with firm — click to unshare" : "Share with firm"}
              >
                <Share2 className="h-3.5 w-3.5" />
              </button>
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

          {firm.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center gap-1.5">
                <Users className="h-3 w-3" /> Firm views
              </DropdownMenuLabel>
              {firm.map((v) => (
                <DropdownMenuItem
                  key={v.id}
                  onSelect={() => onApply(v.params as P)}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate flex-1">{v.name}</span>
                  <span className="text-[10px] text-muted-foreground truncate max-w-[110px]">
                    {v.created_by_email ?? "shared"}
                  </span>
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {naming ? (
        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            placeholder="View name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) save.mutate(); if (e.key === "Escape") { setNaming(false); setName(""); setShareNew(false); } }}
            className="h-8 w-40"
          />
          <label className="flex items-center gap-1 text-xs text-muted-foreground select-none">
            <Checkbox checked={shareNew} onCheckedChange={(c) => setShareNew(c === true)} />
            Share
          </label>
          <Button size="sm" onClick={() => name.trim() && save.mutate()} disabled={!name.trim() || save.isPending}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setNaming(false); setName(""); setShareNew(false); }}>Cancel</Button>
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
