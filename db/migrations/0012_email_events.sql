-- Email events (opens/clicks) for audit + better metrics (proxy/scanner aware)

CREATE TABLE IF NOT EXISTS public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL REFERENCES public.email_outbox(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('open','click')),
  source text NOT NULL DEFAULT 'unknown',
  is_human boolean NOT NULL DEFAULT false,
  ip_hash text NOT NULL DEFAULT '',
  ua text NOT NULL DEFAULT '',
  referer text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_events_outbox_type_created_idx
  ON public.email_events (outbox_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS email_events_type_created_idx
  ON public.email_events (type, created_at DESC);

CREATE INDEX IF NOT EXISTS email_events_source_created_idx
  ON public.email_events (source, created_at DESC);

ALTER TABLE public.email_outbox
  ADD COLUMN IF NOT EXISTS open_human_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_human_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_open_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_click_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_human_open_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_human_click_at timestamptz;

