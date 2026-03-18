ALTER TABLE public.profiles
  ALTER COLUMN email_notifications SET DEFAULT false;

ALTER TABLE public.platform_settings
  ALTER COLUMN email_verification SET DEFAULT false,
  ALTER COLUMN two_factor SET DEFAULT false,
  ALTER COLUMN require_terms_acceptance SET DEFAULT false;

ALTER TABLE public.email_templates
  ALTER COLUMN enabled SET DEFAULT false;
