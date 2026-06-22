
-- 1. Per-client consent. client_id = the portal user's auth.users id.
CREATE TABLE public.client_messaging_consent (
  client_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_opted_out_at timestamptz,
  email_consent_text text,
  email_consent_source text,
  email_consent_at timestamptz,
  -- Reserved for SMS phase
  sms_opt_in boolean NOT NULL DEFAULT false,
  sms_opt_in_at timestamptz,
  sms_opt_in_source text,
  sms_consent_text text,
  sms_opted_out_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_messaging_consent TO authenticated;
GRANT ALL ON public.client_messaging_consent TO service_role;
ALTER TABLE public.client_messaging_consent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff full access on consent"
  ON public.client_messaging_consent FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

CREATE POLICY "Client reads own consent"
  ON public.client_messaging_consent FOR SELECT TO authenticated
  USING (client_id = auth.uid());

CREATE POLICY "Client updates own consent"
  ON public.client_messaging_consent FOR UPDATE TO authenticated
  USING (client_id = auth.uid()) WITH CHECK (client_id = auth.uid());

CREATE POLICY "Client inserts own consent"
  ON public.client_messaging_consent FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid());

CREATE TRIGGER trg_client_messaging_consent_updated_at
  BEFORE UPDATE ON public.client_messaging_consent
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Drafts awaiting attorney approval (denials, etc.)
CREATE TABLE public.held_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id text NOT NULL,
  client_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  msg_key text NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  recipient_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  cta_label text,
  cta_url text,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  sent_by uuid REFERENCES auth.users(id),
  discarded_at timestamptz,
  discarded_by uuid REFERENCES auth.users(id)
);
CREATE INDEX idx_held_messages_case_open ON public.held_messages(case_id) WHERE sent_at IS NULL AND discarded_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.held_messages TO authenticated;
GRANT ALL ON public.held_messages TO service_role;
ALTER TABLE public.held_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff full access on held messages"
  ON public.held_messages FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

-- 3. Singleton settings row.
CREATE TABLE public.messaging_settings (
  id boolean PRIMARY KEY DEFAULT true,
  enabled_milestones jsonb NOT NULL DEFAULT
    '["stage:Application filed","stage:Hearing scheduled","stage:Award / NOA received",
      "stage:Initial decision - approved","stage:Recon decision - approved","stage:ALJ decision - approved",
      "event:documents-requested","event:documents-received"]'::jsonb,
  sms_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id)
);
INSERT INTO public.messaging_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

GRANT SELECT ON public.messaging_settings TO authenticated;
GRANT ALL ON public.messaging_settings TO service_role;
ALTER TABLE public.messaging_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated reads settings"
  ON public.messaging_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins update settings"
  ON public.messaging_settings FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_messaging_settings_updated_at
  BEFORE UPDATE ON public.messaging_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
