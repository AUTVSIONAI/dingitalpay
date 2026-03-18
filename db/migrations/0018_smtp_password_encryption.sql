-- Add encrypted-at-rest columns for SMTP password.
-- Note: backfill is performed by the application/ops script (uses MASTER_KEY), not in SQL.

alter table public.smtp_config
  add column if not exists password_ciphertext text,
  add column if not exists password_iv text,
  add column if not exists password_tag text;

