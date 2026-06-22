## Goal
Remove the "Zoho connected" pill in the top-right header and replace it with an inline global search box that shows results in a dropdown directly under the input (no modal).

## Changes

### 1. New component: `src/components/GlobalSearchBox.tsx`
- Compact search input (icon + `placeholder="Search SSDI cases…"`), ~280px wide on desktop, collapses to icon-only on small screens.
- Reuses the same `zohoQuery({ name: "ssdiCaseSearch", params: { q } })` server fn the command palette uses (already whitelisted).
- Debounced 200ms; triggers when `q.trim().length >= 2`.
- Renders a floating dropdown (absolute-positioned popover under the input) listing up to 8 results: `Case_Number` + `Current_Stage` muted.
- Click result → `navigate({ to: "/practices/ssdi/cases/$id", params: { id } })` and clears/closes.
- Closes on outside click, Escape, or selection. Arrow up/down + Enter for keyboard nav.
- Shows "Searching…" / "No matches" / hidden states.
- Keeps `⌘K` palette intact (separate concern; not removed).

### 2. `src/components/AppShell.tsx`
- Delete the `ZohoStatusPill` component and its render at line 169.
- Drop the now-unused `zohoConnected` prop from `Props` and the destructure (and remove unused `CheckCircle2`, `AlertTriangle` icons).
- Render `<GlobalSearchBox />` in its place in the header (right-aligned, after the `userEmail` div).

### 3. Callers of `<AppShell>`
- Find any place passing `zohoConnected={...}` and remove that prop. (Likely `_authenticated/route.tsx`.) The Zoho connection status is still surfaced via the Connect Zoho redirect flow elsewhere; we're only removing the header indicator per request.

## Out of scope
- No changes to `/connect-zoho` flow or backend.
- `CommandPalette` (⌘K) stays as-is.
