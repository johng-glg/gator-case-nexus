
DROP POLICY IF EXISTS "Firm staff can read case document status"   ON public.case_document_status;
DROP POLICY IF EXISTS "Firm staff can insert case document status" ON public.case_document_status;
DROP POLICY IF EXISTS "Firm staff can update case document status" ON public.case_document_status;
DROP POLICY IF EXISTS "Firm staff can delete case document status" ON public.case_document_status;

CREATE POLICY "Staff read case document status" ON public.case_document_status
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'staff') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Staff insert case document status" ON public.case_document_status
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'staff') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Staff update case document status" ON public.case_document_status
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'staff') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'staff') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Staff delete case document status" ON public.case_document_status
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'staff') OR public.has_role(auth.uid(),'admin'));
