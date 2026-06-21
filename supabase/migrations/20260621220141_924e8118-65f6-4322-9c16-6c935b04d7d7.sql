CREATE TABLE public.ssdi_stage_requirements (
  stage text PRIMARY KEY,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ssdi_stage_requirements TO authenticated;
GRANT ALL ON public.ssdi_stage_requirements TO service_role;

ALTER TABLE public.ssdi_stage_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view stage requirements"
  ON public.ssdi_stage_requirements FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert stage requirements"
  ON public.ssdi_stage_requirements FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update stage requirements"
  ON public.ssdi_stage_requirements FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete stage requirements"
  ON public.ssdi_stage_requirements FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_ssdi_stage_requirements_updated_at
  BEFORE UPDATE ON public.ssdi_stage_requirements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();