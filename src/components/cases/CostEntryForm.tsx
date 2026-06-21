import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COST_CATEGORIES, createCost, deleteCost } from "@/lib/zoho.functions";

/**
 * Inline cost entry form rendered next to the case-page Costs table. Writes
 * directly to the Zoho Costs module (Name / Amount / Cost_Type / Engagement)
 * — no Date_Incurred field exists on the module, so don't add one.
 */
export function CostEntryForm({
  engagementId,
  onCreated,
}: {
  engagementId: string;
  onCreated?: () => void;
}) {
  const createFn = useServerFn(createCost);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [costType, setCostType] = useState<(typeof COST_CATEGORIES)[number]>("Medical records");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setName("");
    setAmount("");
    setCostType("Medical records");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number.parseFloat(amount);
    if (!name.trim()) return toast.error("Description is required.");
    if (!Number.isFinite(amt) || amt < 0) return toast.error("Enter a valid amount.");
    setSubmitting(true);
    try {
      await createFn({ data: { engagementId, name: name.trim(), amount: amt, costType } });
      await queryClient.invalidateQueries({ queryKey: ["costs", engagementId] });
      toast.success("Cost added.");
      reset();
      setOpen(false);
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add cost
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-md border border-border bg-muted/20 p-3 grid grid-cols-1 sm:grid-cols-[1fr_120px_180px_auto] gap-2 items-end"
    >
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Description
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. St. Mary's medical records"
          autoFocus
        />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Amount (USD)
        </label>
        <Input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
        />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Category
        </label>
        <Select
          value={costType}
          onValueChange={(v) => setCostType(v as (typeof COST_CATEGORIES)[number])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COST_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * Small delete button for a single Costs row, used inline in the table.
 */
export function DeleteCostButton({
  costId,
  engagementId,
  costName,
}: {
  costId: string;
  engagementId: string;
  costName: string;
}) {
  const deleteFn = useServerFn(deleteCost);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!confirm(`Delete cost "${costName}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteFn({ data: { costId, engagementId, costName } });
      await queryClient.invalidateQueries({ queryKey: ["costs", engagementId] });
      toast.success("Cost deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy}
      className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
      aria-label={`Delete ${costName}`}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
