-- Store provisioning update token securely (encrypted at rest) for /admin/updates.
-- This is a singleton config stored in platform_settings.

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS updates_token_encrypted jsonb,
  ADD COLUMN IF NOT EXISTS updates_token_hash text,
  ADD COLUMN IF NOT EXISTS updates_token_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS provisioning_base_url text;

