-- Security audit log (no PII): stores blocked/abuse attempts for incident response.

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  ip_hash text not null,
  user_id uuid null,
  role text null,
  route text not null,
  event_type text not null,
  code text null,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists security_events_occurred_at_idx on public.security_events (occurred_at desc);
create index if not exists security_events_user_id_idx on public.security_events (user_id);

