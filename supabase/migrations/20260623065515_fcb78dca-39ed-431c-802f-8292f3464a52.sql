ALTER TABLE public.document_requests
  ALTER COLUMN case_id DROP NOT NULL;

ALTER TABLE public.document_requests
  ADD CONSTRAINT document_requests_case_or_engagement_required
  CHECK (case_id IS NOT NULL OR engagement_id IS NOT NULL);
