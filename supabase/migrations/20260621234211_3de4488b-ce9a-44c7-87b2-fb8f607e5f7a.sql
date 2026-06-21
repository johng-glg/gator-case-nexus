CREATE TABLE public.case_activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id text NOT NULL,
  engagement_id text,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX case_activity_log_case_idx ON public.case_activity_log(case_id, created_at DESC);
CREATE INDEX case_activity_log_created_idx ON public.case_activity_log(created_at DESC);
CREATE INDEX case_activity_log_actor_idx ON public.case_activity_log(actor_user_id, created_at DESC);

GRANT SELECT ON public.case_activity_log TO authenticated;
GRANT ALL ON public.case_activity_log TO service_role;

ALTER TABLE public.case_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Firm staff can view activity log"
  ON public.case_activity_log
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'email') ILIKE '%@gatorlawpc.com');