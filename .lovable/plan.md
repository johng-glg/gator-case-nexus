# Plan — compact 7-phase SSDI lifecycle stepper

Replace the horizontal 24-chip `StageRail` on the case detail page with a 7-phase stepper that only expands the active phase. Grouping is exported from `lifecycle.ts` so the UI never hardcodes the phase list.

## 1. Add phase grouping to `src/integrations/zoho/lifecycle.ts`

Append (does not touch `TRANSITIONS` or `HOOKS`):

```ts
export interface Phase { key: string; label: string; stages: Stage[]; }

export const PHASES: Phase[] = [
  { key: "intake",   label: "Intake & filing",   stages: ["Intake", "Retainer signed", "Application filed"] },
  { key: "initial",  label: "Initial decision",  stages: ["Initial decision - pending", "Initial decision - denied", "Initial decision - approved"] },
  { key: "recon",    label: "Reconsideration",   stages: ["Reconsideration filed", "Recon decision - pending", "Recon decision - denied", "Recon decision - approved"] },
  { key: "alj",      label: "ALJ hearing",       stages: ["ALJ hearing requested", "Hearing scheduled", "Hearing prep", "Hearing held", "ALJ decision - pending", "ALJ decision - denied", "ALJ decision - approved"] },
  { key: "ac",       label: "Appeals Council",   stages: ["Appeals Council requested", "AC decision - pending", "AC decision - denied", "AC decision - approved"] },
  { key: "award",    label: "Award & fees",      stages: ["Award / NOA received", "Fee petition filed"] },
  { key: "closed",   label: "Closed",            stages: ["Closed"] },
];

export function phaseForStage(stage: Stage): Phase | undefined { ... }
export function phaseIndex(stage: Stage): number { ... } // -1 if not found
```

All 24 `Stage` literals are accounted for exactly once.

## 2. Rewrite `src/components/cases/StageRail.tsx`

New component contract: `<StageRail current={stage} />` (unchanged props).

Layout — horizontal phase stepper, active phase expands below:

```text
[✓ Intake & filing]──[✓ Initial decision]──[● Reconsideration]──[ ALJ ]──[ AC ]──[ Award ]──[ Closed ]
                                            │
                                            ├ ✓ Reconsideration filed
                                            ├ ● Recon decision - pending     ← bold
                                            ○ Recon decision - denied
                                            ○ Recon decision - approved
```

Rules:
- Compute `current = phaseIndex(currentStage)`, iterate `PHASES`.
- Phase state: `i < current` → done (muted + check); `i === current` → active (primary/green); `i > current` → upcoming (dimmed, dashed border).
- Thin connector line between chips (`h-px bg-border flex-1`), colored up through `current`.
- Only the active phase renders a sub-list directly beneath the row (absolute/anchored under that chip, or just below the row aligned to it). Sub-stage state computed from `phase.stages.indexOf(currentStage)`:
  - before → check
  - equal → filled dot, bold
  - after → hollow dot
- Past/future phases show only label + icon, no sub-list.
- Use existing tokens (`bg-primary`, `text-muted-foreground`, `border-border`); no hardcoded colors.
- Lucide icons: `Check`, `Circle`, `CircleDot`.
- No `overflow-x-auto`, no `min-w-max`. The row uses `flex w-full` so 7 chips fit at any reasonable width.

## 3. Optional "Full timeline" disclosure

Below the stepper, a small `<button>` "Show full timeline" toggling local state. When open, render the old flat 24-stage list (same visuals as today's rail) in a `<details>`-style block. Collapsed by default. Keeps power-user access without forcing side-scroll.

## 4. Case detail page — no change required

`src/routes/_authenticated/practices.ssdi.cases.$caseId.tsx` already renders `<StageRail current={stage} />` and the "Advance stage" button. Both stay exactly as is.

## Out of scope (v1)
- Branching/"skipped" phase detection from lifecycle dates — noted as future enhancement; v1 styles purely by `phaseIndex`.
- Vertical timeline alternative — sticking with the recommended horizontal layout.
- No changes to `lifecycle.ts` transitions, `HOOKS`, `AdvanceStageDialog`, queries, or routes.

## Acceptance
- Case detail page renders 7 phase chips on one row at standard widths, no horizontal scroll.
- Active phase shows sub-stages; other phases collapsed.
- Current stage is bold with a filled dot; prior sub-stages checked; later hollow.
- "Advance stage" button works unchanged.
- "Show full timeline" reveals the legacy 24-stage list.
