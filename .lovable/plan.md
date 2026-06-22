# Three-phase build plan

Build in order. Each phase is independently shippable. Engine files land in `src/integrations/zoho/` to match the existing codebase (paths in the prompt docs are adjusted to `@/integrations/zoho/...`).

---

## Phase 1 — Google Calendar sync (idempotent)

**Goal:** Each open SSDI case's appeal deadline + ALJ hearing appears on a shared firm Google Calendar, kept in sync via diff/reconcile. No duplicates, no orphans.

### Files
- **New** `src/integrations/zoho/calendarService.ts` — drop the uploaded pure logic verbatim (`desiredEventsForCase` / `reconcile` / `signature`).
- **New** `src/integrations/zoho/calendarService.test.ts` — uploaded smoke test, runnable via `bun`.
- **New** `src/integrations/google/calendarClient.server.ts` — thin wrapper around the Google Calendar connector gateway (`insert` / `update` / `delete` on `${calId}/events`), `toGoogle(event)` mapper (all-day → `start.date`/`end.date`; timed → `start.dateTime`/`end.dateTime` with 1h default end).
- **New** `src/integrations/zoho/caseCalendarSync.ts` — `syncCaseCalendar(caseId)`: loads case record (reuse `caseService` reads), loads link rows from `calendar_event_links`, runs `reconcile`, executes via gcal client, upserts/deletes link rows. Returns `{created, updated, deleted}` counts.
- **Edit** `src/integrations/zoho/caseService.ts` — call `syncCaseCalendar` at the end of `runDailyDeadlineSweep` for each touched open case; aggregate counts into the sweep result.
- **Edit** `src/lib/zoho.functions.ts` — call `syncCaseCalendar` after `advanceStage` and after case-date edits (notice date / hearing date). Add `resyncCaseCalendar` server fn for the manual button.
- **Edit** `src/routes/api/public/deadline-sweep.ts` — surface calendar counts in the digest insert.
- **Edit** `src/components/cases/DeadlinePanel.tsx` + the hearing card — add "On calendar ✓" pill + "Resync" button.
- **Edit** `src/routes/_authenticated/settings.deadline-sweep.tsx` — show last-run calendar created/updated/deleted counts.

### Database (one migration)
```sql
create table public.calendar_event_links (
  case_id text not null,
  key text not null,
  google_event_id text not null,
  sig text not null,
  calendar_id text not null,
  updated_at timestamptz not null default now(),
  primary key (case_id, key)
);
grant select, insert, update, delete on public.calendar_event_links to authenticated;
grant all on public.calendar_event_links to service_role;
alter table public.calendar_event_links enable row level security;
create policy "Staff read" on public.calendar_event_links for select to authenticated
  using (has_role(auth.uid(), 'staff') or has_role(auth.uid(), 'admin'));
-- writes happen via service_role from server fns
```
Also extend `ssdi_deadline_digests` with `calendar_created int`, `calendar_updated int`, `calendar_deleted int` (nullable).

### Connector + secrets
- Link the **Google Calendar** app connector via `standard_connectors--connect`.
- Add secret `GOOGLE_SSDI_CALENDAR_ID` (the shared firm calendar's id, e.g. `xxx@group.calendar.google.com`). I'll prompt for it via `add_secret` when the connector is linked.

### Acceptance
- Advancing a case to a denial creates one calendar event; re-running the sweep adds nothing.
- Editing the notice date updates the same event id.
- Closing a case deletes both events; clearing a date deletes just that one.
- Hearing event is timed, has OHO as location, ALJ in description.

---

## Phase 2 — TCPA-safe client messaging

**Goal:** Auto-notify clients at safe milestones via email + (consented) SMS, defer SMS in quiet hours, hold adverse outcomes for attorney review. Every send/hold logged.

### Files
- **New** `src/integrations/zoho/messagingService.ts` + `.test.ts` — drop the uploaded pure logic verbatim.
- **New** `src/integrations/messaging/emailAdapter.server.ts` — uses the existing app-email pipeline (`/lovable/email/transactional/send`). Needs a new template `case-status-update` registered in `src/lib/email-templates/registry.ts` with `{first_name, subject_line, body_text, unsubscribe_token}`.
- **New** `src/integrations/messaging/smsAdapter.server.ts` — Twilio REST (`messages.json`). Requires secrets `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` — I'll prompt before phase 2 starts. `scheduleSms(deferUntil)` uses Twilio's `SendAt` + `ScheduleType=fixed` (Messaging Service required) OR stores in a `scheduled_sms` table + cron sweep — **see open question Q1**.
- **New** `src/integrations/zoho/notifyService.server.ts` — the `notify({ caseId, stage?, event? })` orchestrator. Loads consent, calls `planDelivery`, dispatches, writes activity log entries (`message_sent` / `message_held`), de-dupes on `msg.key` via activity log lookup.
- **Edit** `src/lib/zoho.functions.ts` — call `notify({stage})` from `advanceStage`; call `notify({event: "documents-requested"})` from the request flow and `documents-received` from upload completion.
- **New** `src/routes/api/public/webhooks/twilio-inbound.ts` — signature-verified handler; on STOP/UNSTOP toggles `sms_opted_out_at`.
- **New** `src/routes/api/public/email-unsubscribe.ts` (or reuse scaffolded one) — sets `email_opted_out_at`.
- **New** `src/components/cases/MessagingPanel.tsx` — consent status (with captured date/source/text), message history (from activity log), draft review queue with "Edit & send" → calls `sendHeldMessage` server fn.
- **Edit** `src/components/portal/...` — SMS opt-in checkbox with the exact consent language saved as `sms_consent_text`; email unsubscribe link in footer (already there if app-email is set up).
- **New** `src/routes/_authenticated/settings.messaging.tsx` — milestone toggles (stored in a new `messaging_settings` JSON row), read-only template list.
- **New** `src/lib/messaging.functions.ts` — server fns: `getConsent`, `setSmsConsent`, `optOutEmail`, `listHeldMessages`, `sendHeldMessage`.

### Database (second migration, after phase 1 ships)
```sql
create table public.client_messaging_consent (
  client_id text primary key,
  engagement_id text,
  email_opted_out_at timestamptz,
  sms_opt_in boolean not null default false,
  sms_opt_in_at timestamptz,
  sms_opt_in_source text,
  sms_consent_text text,
  sms_opted_out_at timestamptz,
  updated_at timestamptz not null default now()
);
-- GRANTs + RLS: staff full access; client portal can read+update own row by client_id mapped through client_portal_links.

create table public.held_messages (
  id uuid primary key default gen_random_uuid(),
  case_id text not null,
  msg_key text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_by uuid references auth.users(id)
);
-- GRANTs + staff-only RLS.

create table public.scheduled_sms (
  id uuid primary key default gen_random_uuid(),
  case_id text not null,
  client_id text not null,
  msg_key text not null,
  body text not null,
  send_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
-- Cron sweep every 15 min flushes due rows.

create table public.messaging_settings (
  id boolean primary key default true,
  enabled_milestones jsonb not null default '["stage:application-filed","stage:hearing-scheduled","stage:award","event:documents-received","event:documents-requested"]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint singleton check (id)
);
```

### Activity log
Extend `ActivityAction` with `"message.sent" | "message.held" | "message.deferred" | "consent.update"`.

### Acceptance
- Client w/ no SMS consent → email only.
- Client opted into SMS at 11pm local → email immediate, SMS scheduled for next 8am.
- Denial stage advance → no auto-send; row appears in attorney review queue.
- Inbound STOP → all future SMS suppressed; email unsubscribe → email suppressed.
- Every send/hold/defer is in `case_activity_log`.

### Open questions for phase 2 (will ask before starting)
- **Q1:** Twilio scheduling — use a Messaging Service with `SendAt` (requires phone-pool setup), or a local `scheduled_sms` table + 15-min cron? Default to local table (simpler, no Twilio config dependency).
- **Q2:** Where lives the SMS opt-in UI in the portal — on first login (mandatory acknowledge) or in a Settings tab? Default: Settings tab, plus a one-time banner on the dashboard.

---

## Phase 3 — UX polish

**Goal:** Command palette (⌘K), persistent global search, saved filters, `/today` landing.

### Files
- **New** `src/components/CommandPalette.tsx` — uses existing shadcn `Command` primitives. Two modes: search (debounced 200ms) + commands (fuzzy). Wired in `AppShell.tsx` via `useEffect` keydown listener (Cmd/Ctrl+K).
- **New** `src/lib/search.functions.ts` — server fns calling new whitelisted COQL `globalSearch(term)`:
  - Leads: `where (First_Name like '%T%' or Last_Name like '%T%' or Email like '%T%' or Phone like '%T%') limit 5`
  - Contacts: First/Last/Email
  - Engagements: Name
  - SSDI_Cases: Case_Number
  - Single-quote escape the term; whitelist in `zoho-queries.ts`.
- **Edit** `src/components/AppShell.tsx` — add the persistent search input in the header that opens the palette; keyboard shortcut handler; `?` cheatsheet overlay; `g d` / `g l` / `g t` / `g c` / `n l` nav shortcuts via a small key-sequence hook.
- **New** `src/lib/saved-views.functions.ts` + **migration** for `saved_views` (`user_id uuid, page text, name text, params jsonb, created_at`; RLS: owner only).
- **New** `src/components/SavedViewsMenu.tsx` — picker/save/rename/delete; wired into Leads list, Deadlines, SSDI reports (3 places).
- **New** `src/routes/_authenticated/today.tsx` — five cards (My deadlines, My tasks, Upcoming hearings, Leads to qualify, Retainers awaiting signature ≥3d). Reuses existing queries; "Retainers awaiting signature" adds a small new query filtering `Retainer_Status = "Sent" and Retainer_Sent_Date < <3 days ago>`.
- **Edit** `src/routes/_authenticated/route.tsx` — redirect `/` → `/today` for staff after login.

### Database (third migration)
`saved_views` table only.

### Acceptance
- ⌘K finds a client by last name, a case by number, runs "New lead".
- Saved Leads view persists across sessions and devices.
- `/today` shows the signed-in attorney's scope; empty states are clean.

---

## Sequencing & gates
1. Build phase 1 end-to-end → smoke-test calendar sync on one real case → ship.
2. Pause for phase 2 questions (Q1, Q2, Twilio secrets). Build phase 2 → test consent + adverse hold path → ship.
3. Build phase 3 → ship.

Total new tables: 5 (`calendar_event_links`, `client_messaging_consent`, `held_messages`, `scheduled_sms`, `messaging_settings`, `saved_views`).
New cron job: 15-min `scheduled_sms` flush (phase 2 only).
New secrets needed: `GOOGLE_SSDI_CALENDAR_ID`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.
