-- Document request flow: staff request docs from clients; clients upload via portal.
CREATE TABLE public.document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id text NOT NULL,
  engagement_id text,
  label text NOT NULL,
  instructions text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','fulfilled','canceled')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz,
  canceled_at timestamptz
);
CREATE INDEX document_requests_case_idx ON public.document_requests(case_id);

GRANT SELECT, INSERT, UPDATE ON public.document_requests TO authenticated;
GRANT ALL ON public.document_requests TO service_role;

ALTER TABLE public.document_requests ENABLE ROW LEVEL SECURITY;
-- All access goes through server functions using the service role; deny direct client.
CREATE POLICY "deny_direct_access_document_requests" ON public.document_requests
  FOR SELECT TO authenticated USING (false);

CREATE TABLE public.document_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES public.document_requests(id) ON DELETE SET NULL,
  case_id text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  original_name text NOT NULL,
  size_bytes bigint,
  mime_type text,
  uploaded_by_user uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_by_email text,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_uploads_case_idx ON public.document_uploads(case_id);
CREATE INDEX document_uploads_request_idx ON public.document_uploads(request_id);

GRANT SELECT, INSERT ON public.document_uploads TO authenticated;
GRANT ALL ON public.document_uploads TO service_role;

ALTER TABLE public.document_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_direct_access_document_uploads" ON public.document_uploads
  FOR SELECT TO authenticated USING (false);
