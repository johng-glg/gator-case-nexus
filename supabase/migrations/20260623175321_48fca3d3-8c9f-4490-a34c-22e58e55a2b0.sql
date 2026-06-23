DROP POLICY IF EXISTS "Authenticated can read sweep log" ON public.medical_records_sweep_log;

CREATE POLICY "Staff read sweep log" ON public.medical_records_sweep_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'staff') OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Anyone authenticated reads settings" ON public.messaging_settings;

CREATE POLICY "Staff read messaging settings" ON public.messaging_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'staff') OR public.has_role(auth.uid(),'admin'));