
CREATE TABLE public.zoho_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  zoho_user_id TEXT,
  refresh_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.zoho_tokens TO service_role;

ALTER TABLE public.zoho_tokens ENABLE ROW LEVEL SECURITY;

-- No policies granting anon/authenticated access. Only service_role (server-side) reads/writes.
