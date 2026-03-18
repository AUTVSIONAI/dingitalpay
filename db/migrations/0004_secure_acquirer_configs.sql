-- Store sensitive acquirer credentials encrypted at rest.
-- The API should read/write credentials via these columns using MASTER_KEY.

ALTER TABLE public.acquirer_configs
  ADD COLUMN IF NOT EXISTS credentials_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS credentials_iv TEXT,
  ADD COLUMN IF NOT EXISTS credentials_tag TEXT,
  ADD COLUMN IF NOT EXISTS credentials_version INTEGER NOT NULL DEFAULT 1;

-- Optional: keep "credentials" jsonb for backwards compatibility, but prefer encrypted columns going forward.
