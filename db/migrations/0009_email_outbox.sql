-- Email outbox + logs for reliable delivery (worker-based)

-- Outbox jobs (rendered subject/body stored to avoid changing queued emails if template changes)
CREATE TABLE IF NOT EXISTS public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  template_event_key text NOT NULL DEFAULT '',
  to_email text NOT NULL,
  subject text NOT NULL DEFAULT '',
  html text NOT NULL DEFAULT '',
  text text NOT NULL DEFAULT '',
  vars jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','failed','canceled')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_retry_at timestamptz,
  last_error text NOT NULL DEFAULT '',
  locked_at timestamptz,
  sent_at timestamptz,
  canceled_at timestamptz,
  dedupe_key text,
  open_count integer NOT NULL DEFAULT 0,
  click_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_dedupe_key_unique
  ON public.email_outbox (dedupe_key)
  WHERE dedupe_key IS NOT NULL AND dedupe_key <> '';

CREATE INDEX IF NOT EXISTS email_outbox_status_retry_idx
  ON public.email_outbox (status, next_retry_at, created_at);

CREATE INDEX IF NOT EXISTS email_outbox_campaign_idx
  ON public.email_outbox (campaign_id, created_at);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'update_updated_at_column'
      AND pg_function_is_visible(oid)
  ) THEN
    CREATE TRIGGER update_email_outbox_updated_at
      BEFORE UPDATE ON public.email_outbox
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Logs (auditoria) por job
CREATE TABLE IF NOT EXISTS public.email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL REFERENCES public.email_outbox(id) ON DELETE CASCADE,
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('info','error')),
  message text NOT NULL DEFAULT '',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_logs_outbox_idx
  ON public.email_logs (outbox_id, created_at);

-- Optional: mark delivery timestamp for smtp_config (non-breaking)
ALTER TABLE public.smtp_config
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz;

