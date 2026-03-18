-- Ensure fresh installs don't start with required acceptance without legal content.

UPDATE public.platform_settings
SET require_terms_acceptance = false
WHERE COALESCE(trim(terms_of_use), '') = ''
  AND COALESCE(trim(privacy_policy), '') = ''
  AND require_terms_acceptance = true;
