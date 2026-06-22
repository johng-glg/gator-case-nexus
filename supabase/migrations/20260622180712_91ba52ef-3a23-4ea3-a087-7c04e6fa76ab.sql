CREATE TABLE public.medical_records_sweep_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  open_count INTEGER NOT NULL DEFAULT 0,
  tasks_created INTEGER NOT NULL DEFAULT 0,
  stale_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.medical_records_sweep_log TO authenticated;
GRANT ALL ON public.medical_records_sweep_log TO service_role;

ALTER TABLE public.medical_records_sweep_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read sweep log"
  ON public.medical_records_sweep_log
  FOR SELECT
  TO authenticated
  USING (true);
