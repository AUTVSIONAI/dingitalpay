ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMP WITH TIME ZONE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'email_campaigns_status_check'
  ) THEN
    ALTER TABLE public.email_campaigns
      DROP CONSTRAINT email_campaigns_status_check;
  END IF;

  ALTER TABLE public.email_campaigns
    ADD CONSTRAINT email_campaigns_status_check
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'canceled'));
END
$$;
