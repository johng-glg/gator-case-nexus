# Phase 2 — Client messaging (email-only, SMS deferred)

Auto-notify clients at safe case milestones via email. Adverse outcomes (denials) are held for attorney review before sending. Consent + opt-out captured in the portal Settings tab. SMS is **not** built now — schema and UI leave a hidden hook for later.

## Scope decisions (locked in)
- **Channels now:** email only. No Twilio, no `scheduled_sms` table, no SMS adapter, no Twilio webhook.
- **Scheduling:** none. Emails send inline when the milestone fires (queue handles retries).
- **SMS later:** schema reserves SMS consent columns; portal UI shows a disabled "SMS reminders — coming soon" row; settings page has a hidden flag that surfaces it when SMS ships.
- **Opt-in placement:** portal Settings tab toggle. Non-blocking. Consent boxes unchecked by default. We capture exact consent text + timestamp + source (`"portal-settings"`).
- **Adverse outcomes:** denial-stage advances queue a draft into a staff-only review panel; nothing leaves the building until an attorney clicks "Send".

## Email infrastructure
`notify.app.guardianlit.com` is already verified. I'll run:
1. `email_domain--setup_email_infra` — creates pgmq queues, cron, suppression tables.
2. `email_domain--scaffold_transactional_email` — creates send/preview/unsubscribe routes + template registry.

Then register one branded template: **`case-status-update`** (props: `firstName`, `caseLabel`, `subjectLine`, `bodyText`, `ctaUrl?`, `ctaLabel?`).

## New engine files (pure, testable)
- `src/integrations/messaging/messagingService.ts` + `.test.ts` — drop the uploaded `planDelivery` / `renderMessage` logic, trimmed to email-only (drop the quiet-hours/SMS branches; keep the adverse-hold branch and the dedupe-key generator).
- `src/integrations/messaging/emailAdapter.server.ts` — thin wrapper around the scaffolded `/lovable/email/transactional/send` route, called server-to-server with the service-role JWT.
- `src/integrations/zoho/notifyService.server.ts` — orchestrator: load consent → `planDelivery` → either send-now (queue), hold-for-review, or skip-suppressed → write `case_activity_log` entry. De-dupes via `msg_key` lookup in activity log.

## Wiring (mutation hooks)
`src/lib/zoho.functions.ts`:
- `caseAdvance` → `notifySafe({ caseId, stage: newStage })` (fire-and-forget like the calendar sync).
- Document-request create → `notifySafe({ caseId, event: "documents-requested" })`.
- Document-upload-completed → `notifySafe({ caseId, event: "documents-received" })`.
- Add server fns: `getConsent`, `setEmailOptOut`, `listHeldMessages`, `sendHeldMessage`, `discardHeldMessage`, `getMessagingSettings`, `setMessagingSettings`.

## UI
- **`src/components/cases/MessagingPanel.tsx`** (new, on case page): consent badge ("Email: opted in / opted out"), recent messages (from activity log filtered to `message.*`), draft review queue with **Edit & Send** / **Discard**.
- **Portal Settings tab** (`src/routes/_client/portal.tsx` — add/extend a Settings section): single checkbox "Email me case updates" (default on for existing clients, prompts new clients), greyed-out "SMS reminders — coming soon" placeholder, displayed consent language + last updated.
- **`src/routes/_authenticated/settings.messaging.tsx`** (new admin tab): per-milestone toggles (`stage:application-filed`, `stage:hearing-scheduled`, `stage:award`, `event:documents-requested`, `event:documents-received`), read-only template preview link, hidden `sms_enabled` flag for later.

## Database (one migration)

```sql
-- Per-client consent. SMS columns reserved but unused until SMS ships.
create table public.client_messaging_consent (
  client_id text primary key,
  email_opted_out_at timestamptz,
  email_consent_text text,
  email_consent_source text,
  email_consent_at timestamptz,
  sms_opt_in boolean not null default false,   -- reserved
  sms_opt_in_at timestamptz,                   -- reserved
  sms_opt_in_source text,                      -- reserved
  sms_consent_text text,                       -- reserved
  sms_opted_out_at timestamptz,                -- reserved
  updated_at timestamptz not null default now()
);

-- Drafts waiting on attorney approval (denials, etc.)
create table public.held_messages (
  id uuid primary key default gen_random_uuid(),
  case_id text not null,
  client_id text not null,
  msg_key text not null,                       -- dedupe key
  channel text not null default 'email',
  subject text not null,
  body text not null,
  reason text not null,                        -- e.g. "adverse-outcome"
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_by uuid references auth.users(id),
  discarded_at timestamptz,
  discarded_by uuid references auth.users(id)
);

-- Singleton row of which milestones are enabled.
create table public.messaging_settings (
  id boolean primary key default true,
  enabled_milestones jsonb not null default
    '["stage:application-filed","stage:hearing-scheduled","stage:award",
      "event:documents-requested","event:documents-received"]'::jsonb,
  sms_enabled boolean not null default false,  -- hides SMS UI everywhere
  updated_at timestamptz not null default now(),
  constraint singleton check (id)
);
```
Plus the standard `GRANT` block for each (`authenticated` + `service_role`; portal needs `client_messaging_consent` upsert scoped via `client_portal_links`), RLS policies, and `updated_at` trigger reuse.

Extend `case_activity_log` actions with `message.sent`, `message.held`, `message.discarded`, `consent.update` — values only, no schema change (it's a free-text action column).

## Acceptance
- Advance a case to **Application Filed** → client receives one branded email; re-running the action does not duplicate (dedupe by `msg_key`).
- Advance a case to **Recon Denial** → no email goes out; a draft appears in the case Messaging panel; attorney clicks **Send** → email goes out, activity row recorded.
- Client opens portal Settings → toggles email off → next milestone records `message.held` with reason `email-opted-out` (no send).
- Email opens the scaffolded unsubscribe page → flips `email_opted_out_at` → same behavior.
- Messaging settings page disables `stage:award` → next award advance records `message.held` with reason `milestone-disabled`.
- All sends/holds/discards visible in case Activity panel and in `case_activity_log`.

## Out of scope (deferred to a future SMS phase)
- Twilio adapter, A2P 10DLC registration, inbound STOP/UNSTOP webhook.
- `scheduled_sms` table + 15-min cron flush.
- Quiet-hours deferral logic (resurfaces in `planDelivery` when SMS lands).
- Portal SMS opt-in toggle (placeholder only).

## Sequencing
1. Run email infra setup + scaffold (one turn).
2. Migration + engine + adapter + tests.
3. Wire `notifySafe` into `caseAdvance` and the document flows.
4. Build MessagingPanel + portal Settings + admin Messaging settings.
5. Smoke-test on the open case currently on screen; ship.
