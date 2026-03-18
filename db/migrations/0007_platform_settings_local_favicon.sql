-- Remove legacy Supabase Storage URL from favicon_url (self-hosted deployment).
-- Prefer a relative path so it works across domains.

UPDATE public.platform_settings
SET favicon_url = '/favicon.ico'
WHERE favicon_url ILIKE '%supabase.co/%'
   OR favicon_url IS NULL
   OR trim(favicon_url) = '';

