CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_kind text NOT NULL CHECK (session_kind IN ('admin', 'customer')),
  email text NOT NULL,
  product_key text NOT NULL,
  license_id uuid NULL,
  current_step integer NOT NULL DEFAULT 0 CHECK (current_step >= 0 AND current_step <= 20),
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'reset')),
  schema_version integer NOT NULL DEFAULT 1,
  progress_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_client_saved_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_kind, email, product_key)
);

CREATE INDEX IF NOT EXISTS onboarding_progress_email_idx
  ON public.onboarding_progress (email, product_key);

CREATE INDEX IF NOT EXISTS onboarding_progress_status_idx
  ON public.onboarding_progress (status, updated_at DESC);
