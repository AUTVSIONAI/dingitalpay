-- Enforce singleton semantics for admin config tables used by the UI.
-- The frontend updates these tables using a broad filter (`id IS NOT NULL`), so we must guarantee
-- there is exactly one row to avoid accidental multi-row updates.

-- ========================
-- platform_settings
-- ========================

-- Keep only the oldest row (if duplicates exist)
DELETE FROM public.platform_settings
WHERE id NOT IN (
  SELECT id FROM public.platform_settings
  ORDER BY created_at ASC
  LIMIT 1
);

-- Ensure one row exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_settings) THEN
    INSERT INTO public.platform_settings DEFAULT VALUES;
  END IF;
END $$;

-- Enforce singleton (unique index on a constant)
CREATE UNIQUE INDEX IF NOT EXISTS platform_settings_singleton
  ON public.platform_settings ((1));

-- ========================
-- smtp_config
-- ========================

-- Keep only the oldest row (if duplicates exist)
DELETE FROM public.smtp_config
WHERE id NOT IN (
  SELECT id FROM public.smtp_config
  ORDER BY created_at ASC
  LIMIT 1
);

-- Ensure one row exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.smtp_config) THEN
    INSERT INTO public.smtp_config DEFAULT VALUES;
  END IF;
END $$;

-- Enforce singleton (unique index on a constant)
CREATE UNIQUE INDEX IF NOT EXISTS smtp_config_singleton
  ON public.smtp_config ((1));

