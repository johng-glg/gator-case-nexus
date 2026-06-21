CREATE TABLE public.client_portal_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  zoho_case_id text NOT NULL,
  zoho_engagement_id text,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX client_portal_links_case_idx ON public.client_portal_links(zoho_case_id);
CREATE INDEX client_portal_links_email_idx ON public.client_portal_links(lower(email));

GRANT SELECT ON public.client_portal_links TO authenticated;
GRANT ALL ON public.client_portal_links TO service_role;

ALTER TABLE public.client_portal_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own portal link"
  ON public.client_portal_links
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER set_client_portal_links_updated_at
  BEFORE UPDATE ON public.client_portal_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();