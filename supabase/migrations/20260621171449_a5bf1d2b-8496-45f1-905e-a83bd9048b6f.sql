
ALTER TABLE public.zoho_firm_tokens
  ADD COLUMN IF NOT EXISTS client_id text,
  ADD COLUMN IF NOT EXISTS client_secret text,
  ALTER COLUMN refresh_token DROP NOT NULL;
