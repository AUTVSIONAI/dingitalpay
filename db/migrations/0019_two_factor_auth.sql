-- Two-Factor Authentication (TOTP) for self-host auth
-- - Mandatory for admin/seller (platform policy), optional for buyer
-- - Stores TOTP secret encrypted at rest (AES-256-GCM via MASTER_KEY in API)
-- - Recovery codes are stored hashed (one-time use)
-- - Trusted devices store a hashed token with expiry (remember device)

-- Sessions: keep MFA state per session
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS mfa_pending BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_setup_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMPTZ;

-- Per-user MFA configuration (encrypted secret)
CREATE TABLE IF NOT EXISTS public.user_two_factor (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  secret_ciphertext TEXT,
  secret_iv TEXT,
  secret_tag TEXT,
  pending_secret_ciphertext TEXT,
  pending_secret_iv TEXT,
  pending_secret_tag TEXT,
  pending_created_at TIMESTAMPTZ,
  enabled_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_user_two_factor_updated_at ON public.user_two_factor;
CREATE TRIGGER update_user_two_factor_updated_at
BEFORE UPDATE ON public.user_two_factor
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Recovery codes (hash only, one-time use)
CREATE TABLE IF NOT EXISTS public.user_two_factor_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ,
  UNIQUE (user_id, code_hash)
);

CREATE INDEX IF NOT EXISTS user_two_factor_recovery_codes_user_id_idx
  ON public.user_two_factor_recovery_codes(user_id);
CREATE INDEX IF NOT EXISTS user_two_factor_recovery_codes_used_at_idx
  ON public.user_two_factor_recovery_codes(used_at);

-- Trusted devices (remember device)
CREATE TABLE IF NOT EXISTS public.user_two_factor_trusted_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  user_agent TEXT,
  ip TEXT
);

CREATE INDEX IF NOT EXISTS user_two_factor_trusted_devices_user_id_idx
  ON public.user_two_factor_trusted_devices(user_id);
CREATE INDEX IF NOT EXISTS user_two_factor_trusted_devices_expires_at_idx
  ON public.user_two_factor_trusted_devices(expires_at);

