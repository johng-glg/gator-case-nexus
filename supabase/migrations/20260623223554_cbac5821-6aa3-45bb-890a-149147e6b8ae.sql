ALTER TABLE public.saved_views
  ADD COLUMN IF NOT EXISTS shared_with_firm boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by_email text;

DROP POLICY IF EXISTS "Users manage their own saved views" ON public.saved_views;

CREATE POLICY "Read own or firm-shared views"
  ON public.saved_views FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR shared_with_firm = true);

CREATE POLICY "Insert own saved views"
  ON public.saved_views FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Update own saved views"
  ON public.saved_views FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Delete own saved views"
  ON public.saved_views FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);