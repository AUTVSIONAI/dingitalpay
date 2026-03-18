-- Sanitize historical security_events meta fields to avoid storing raw IPs or other sensitive values.
-- This is a safe, idempotent data fix (no schema changes).

do $$
begin
  -- Older versions stored `bucket` as e.g. "auth:1.2.3.4". Keep only the bucket prefix.
  update public.security_events
  set meta = jsonb_set(
    meta,
    '{bucket}',
    to_jsonb(split_part(coalesce(meta->>'bucket',''), ':', 1)),
    true
  )
  where event_type = 'rate_limited'
    and (meta ? 'bucket')
    and (meta->>'bucket') like '%:%';
end $$;

