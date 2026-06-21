CREATE TABLE public.ssdi_deadline_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  scanned int NOT NULL DEFAULT 0,
  updated int NOT NULL DEFAULT 0,
  overdue jsonb NOT NULL DEFAULT '[]'::jsonb,
  due_soon jsonb NOT NULL DEFAULT '[]'::jsonb,
  release_expiring jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ssdi_deadline_digests TO authenticated;
GRANT ALL  ON public.ssdi_deadline_digests TO service_role;

ALTER TABLE public.ssdi_deadline_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view digests"
  ON public.ssdi_deadline_digests FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX ssdi_deadline_digests_ran_at_idx ON public.ssdi_deadline_digests (ran_at DESC);