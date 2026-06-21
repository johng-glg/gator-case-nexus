
CREATE POLICY "Deny all client access to zoho_tokens"
  ON public.zoho_tokens
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
