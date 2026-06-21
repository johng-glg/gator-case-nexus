## Fix: COQL cannot select formula or rollup-summary fields

Zoho COQL rejects formula and rollup fields (`All_Fees`, `Total_Costs1`, `Projected_Fee`, `User_Fee_Withheld`, `Net_Contribution`). Those values must be fetched via the record GET API.

## Changes

### 1. `src/lib/zoho-queries.ts` — `engagementById`
Remove rollups from the SELECT. Keep only plain fields:
```
select Name, Engagement_Type, Engagement_Status, Retainer_Status,
       Client.First_Name, Client.Last_Name
from Engagements
where id = {id}
limit 1
```
(`All_Fees`, `Total_Costs1` removed.)

Also restore the Client lookup subfields to `ENGAGEMENT_COLS` for the list views (they're plain lookup fields, allowed in COQL — only the rollups were the problem). Leave `Assigned_Attorney` off until confirmed.

### 2. `src/lib/zoho.functions.ts` — add a record-GET server fn for engagements
Add `getEngagement` paralleling the existing `getCase`:
```ts
export const getEngagement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ engagementId: z.string().regex(/^[A-Za-z0-9_]+$/) }).parse(data))
  .handler(async ({ data, context }) => {
    const { makeZohoClient } = await import("@/integrations/zoho/client.server");
    const record = await makeZohoClient().as(context.userId).getRecord("Engagements", data.engagementId);
    return { record: record ? toJson<ZohoRow>(record) : null };
  });
```
This returns rollups (`All_Fees`, `Total_Costs1`) and the Client lookup as `{id, name}`.

### 3. Engagement detail consumers
No engagement detail route exists yet that uses `engagementById` for money fields, so nothing else needs to swap today. The rule going forward: any view that needs `All_Fees` / `Total_Costs1` calls `getEngagement`, not `zohoQuery({name:"engagementById"})`. The SSDI case detail already uses `getCase` (record GET), so `Projected_Fee` / `User_Fee_Withheld` are fine there.

## Out of scope
- No UI changes; the engagements list already renders without the money columns.
- `Assigned_Attorney` API name still unconfirmed — keep it out of the list query.

## Verification
After the edits, `rg "All_Fees|Total_Costs1|Projected_Fee|User_Fee_Withheld|Net_Contribution" src/lib/zoho-queries.ts` should return zero hits. The `/engagements` page and any engagementById call should stop 400-ing.
