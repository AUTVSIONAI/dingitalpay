CREATE TABLE IF NOT EXISTS public.onboarding_setup_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_key uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  schema_version integer NOT NULL DEFAULT 1,
  brand_name text NULL,
  desired_domain text NULL,
  admin_email text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  logo_file_name text NULL,
  logo_content_type text NULL,
  logo_size_bytes integer NULL,
  logo_data_base64 text NULL,
  submitted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_setup_forms_status_idx
  ON public.onboarding_setup_forms (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS onboarding_setup_forms_admin_email_idx
  ON public.onboarding_setup_forms (admin_email, updated_at DESC);

CREATE INDEX IF NOT EXISTS onboarding_setup_forms_domain_idx
  ON public.onboarding_setup_forms (desired_domain, updated_at DESC);

DROP TRIGGER IF EXISTS update_onboarding_setup_forms_updated_at ON public.onboarding_setup_forms;
CREATE TRIGGER update_onboarding_setup_forms_updated_at
  BEFORE UPDATE ON public.onboarding_setup_forms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.onboarding_setup_forms TO dingitalpay_app;
