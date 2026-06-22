## Two separate bugs

### 1. Wrong sent timestamp (6/21 @ 5pm)

`retainerService.ts` uses `localToday()` as its `now()`:

```ts
const now = () => (deps.now ? deps.now() : localToday());
```

`localToday()` returns **midnight UTC of today's Pacific date** — designed for date-only deadline math, not real timestamps. So when we stamp `Retainer_Sent` today (6/22 PT) we send `2026-06-22T00:00:00+00:00`. Zoho displays it in the org's Pacific timezone → `2026-06-21 5:00pm`. Same problem will hit `Retainer_Viewed` and `Retainer_Signed_Date`.

**Fix:** use the real wall-clock for these timestamps. Replace the `now()` default with `new Date()` in `retainerService.ts` (keep the `deps.now` override for tests).

Also, `engagements.$engagementId.tsx` line 157 reads `record.Retainer_Sent_Date` — but the actual Zoho field is `Retainer_Sent`. The panel never sees the value (this is why "sent" doesn't show on the engagement either).

### 2. Viewed/Signed never lands (separate from yesterday's COQL fix)

Yesterday's fix to `Retainer_Viewed_Date` → `Retainer_Viewed` is correct, but the **already-fired Zoho webhook for this engagement won't be retried** by Zoho — so this engagement stays stuck at "Sent" forever even though the fix is deployed.

To unblock signed engagements that got stuck before the fix, add a small admin server fn `retainerMarkSigned(engagementId)` that does what the webhook would have done:
- stamp `Retainer_Status = "Signed"`, `Retainer_Signed_Date = now` on the engagement (using real `new Date()`)
- call the SSDI case opener

Wire a "Mark as signed (manual)" button into `RetainerPanel`, shown only when status is "Sent" (and gated to admins) so this is recoverable without poking Zoho.

## Files to change

- `src/integrations/zoho/retainerService.ts` — `now()` default = `new Date()` instead of `localToday()`.
- `src/routes/_authenticated/engagements.$engagementId.tsx` — read `record.Retainer_Sent` (not `Retainer_Sent_Date`); add manual "Mark signed" button + mutation.
- `src/lib/zoho.functions.ts` — add `retainerMarkSigned` server fn (admin-only) that flips status + invokes the case opener.

## Out of scope

- No changes to `localToday()` itself or deadline math.
- No webhook signature / Zoho config changes.

## Question

Are you OK with a manual "Mark signed" button as the recovery path for engagements that signed before the COQL fix landed? (Alternative: I can instead reset + you re-sign the doc in Zoho, but that recreates the signed PDF.)