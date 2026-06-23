-- New: contact-keyed portal account
CREATE TABLE public.client_portal_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  zoho_contact_id TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  intake_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.client_portal_contacts TO authenticated;
GRANT ALL ON public.client_portal_contacts TO service_role;

ALTER TABLE public.client_portal_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients read own portal contact"
  ON public.client_portal_contacts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_client_portal_contacts_zoho_contact
  ON public.client_portal_contacts (zoho_contact_id);
CREATE INDEX idx_client_portal_contacts_email
  ON public.client_portal_contacts (lower(email));

CREATE TRIGGER trg_client_portal_contacts_updated_at
  BEFORE UPDATE ON public.client_portal_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Allow document_requests to be scoped to a pre-case engagement.
ALTER TABLE public.document_requests
  ADD COLUMN IF NOT EXISTS engagement_id TEXT;

CREATE INDEX IF NOT EXISTS idx_document_requests_engagement
  ON public.document_requests (engagement_id);
