CREATE TABLE public.case_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id text NOT NULL,
  author_id uuid NOT NULL DEFAULT auth.uid(),
  author_email text,
  note_type text NOT NULL DEFAULT 'general',
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_notes_type_chk CHECK (note_type IN ('general','phone_call','client_meeting','ssa_oho_contact','internal_strategy'))
);

CREATE INDEX case_notes_case_idx ON public.case_notes (case_id, pinned DESC, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_notes TO authenticated;
GRANT ALL ON public.case_notes TO service_role;

ALTER TABLE public.case_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read case notes" ON public.case_notes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'staff') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Staff write case notes" ON public.case_notes FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(),'staff') OR public.has_role(auth.uid(),'admin')) AND author_id = auth.uid());

CREATE POLICY "Author or admin update notes" ON public.case_notes FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (author_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Author or admin delete notes" ON public.case_notes FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER update_case_notes_updated_at
  BEFORE UPDATE ON public.case_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();