CREATE TABLE public.calendar_event_links (
  case_id text NOT NULL,
  key text NOT NULL,
  google_event_id text NOT NULL,
  sig text NOT NULL,
  calendar_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, key)
);

GRANT SELECT ON public.calendar_event_links TO authenticated;
GRANT ALL ON public.calendar_event_links TO service_role;

ALTER TABLE public.calendar_event_links ENABLE ROW LEVEL SECURITY;

-- Staff/admins can read the link map. Writes go through the service role from server fns.
CREATE POLICY "Staff can read calendar links"
ON public.calendar_event_links
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

-- Extend the digest table with calendar sync counts for the Deadline Sweep page.
ALTER TABLE public.ssdi_deadline_digests
  ADD COLUMN IF NOT EXISTS calendar_created int,
  ADD COLUMN IF NOT EXISTS calendar_updated int,
  ADD COLUMN IF NOT EXISTS calendar_deleted int,
  ADD COLUMN IF NOT EXISTS calendar_errors int;