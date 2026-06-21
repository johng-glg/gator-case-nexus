
CREATE TABLE public.zoho_firm_tokens (
  key text PRIMARY KEY,
  refresh_token text NOT NULL,
  refresh_tail text,
  last_rotated_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.zoho_firm_tokens TO service_role;

ALTER TABLE public.zoho_firm_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all client access to zoho_firm_tokens"
  ON public.zoho_firm_tokens
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
