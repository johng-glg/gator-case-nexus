
CREATE TABLE public.case_document_status (
  case_id text NOT NULL,
  doc_code text NOT NULL,
  status text NOT NULL CHECK (status IN ('To do','Sent','Received','Filed')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (case_id, doc_code)
);

CREATE INDEX case_document_status_case_id_idx ON public.case_document_status (case_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_document_status TO authenticated;
GRANT ALL ON public.case_document_status TO service_role;

ALTER TABLE public.case_document_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Firm staff can read case document status"
  ON public.case_document_status FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Firm staff can insert case document status"
  ON public.case_document_status FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Firm staff can update case document status"
  ON public.case_document_status FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Firm staff can delete case document status"
  ON public.case_document_status FOR DELETE
  TO authenticated USING (true);
