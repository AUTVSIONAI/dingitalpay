CREATE TABLE IF NOT EXISTS public.onboarding_progress_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progress_id uuid NULL REFERENCES public.onboarding_progress(id) ON DELETE SET NULL,
  session_kind text NOT NULL CHECK (session_kind IN ('admin', 'customer')),
  email text NOT NULL,
  product_key text NOT NULL,
  license_id uuid NULL,
  event_type text NOT NULL,
  from_step integer NULL,
  to_step integer NULL,
  status text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_progress_events_email_idx
  ON public.onboarding_progress_events (email, product_key, created_at DESC);

CREATE INDEX IF NOT EXISTS onboarding_progress_events_progress_idx
  ON public.onboarding_progress_events (progress_id, created_at DESC);
