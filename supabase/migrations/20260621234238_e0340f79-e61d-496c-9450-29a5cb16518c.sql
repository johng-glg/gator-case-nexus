ALTER TABLE public.case_activity_log ALTER COLUMN case_id DROP NOT NULL;
ALTER TABLE public.case_activity_log ADD CONSTRAINT case_activity_log_scope_chk
  CHECK (case_id IS NOT NULL OR engagement_id IS NOT NULL);
CREATE INDEX case_activity_log_engagement_idx ON public.case_activity_log(engagement_id, created_at DESC);