-- Add basic segmentation for marketing campaigns

ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS segment text NOT NULL DEFAULT 'buyers',
  ADD COLUMN IF NOT EXISTS segment_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Allow only known segments (best-effort; keep backward compatible)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_campaigns_segment_check'
  ) THEN
    ALTER TABLE public.email_campaigns
      ADD CONSTRAINT email_campaigns_segment_check
      CHECK (segment IN ('buyers','sellers','all'));
  END IF;
END $$;

