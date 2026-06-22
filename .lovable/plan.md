## Plan

1. **Fix the COQL search templates**
   - Update the global search queries to use COQL-safe syntax for text matching.
   - Remove fragile multi-field `or` COQL clauses that are currently causing `SYNTAX_ERROR`.
   - Keep searching cases, clients, leads, and engagements, but make each query valid and conservative.

2. **Prevent search failures from blanking the app**
   - Make the global search component tolerate individual module query failures.
   - If one backend search fails, show available results from the other modules instead of crashing the page.

3. **Improve error visibility for future debugging**
   - Add lightweight server-side logging of the whitelisted query name when a COQL call fails, without exposing sensitive data.

4. **Verify the fix**
   - Recheck the edited query definitions and ensure the search dropdown no longer triggers the runtime error path.

## Technical details

- Main files: `src/lib/zoho-queries.ts`, `src/lib/zoho.functions.ts`, and possibly `src/components/GlobalSearchBox.tsx`.
- Likely root cause: Zoho COQL is rejecting one of the newly added search templates, especially the `OR`/`LIKE` search clauses.
- The implementation will keep the existing inline dropdown behavior and only change the failing search logic.