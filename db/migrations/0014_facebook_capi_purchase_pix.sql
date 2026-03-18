-- Facebook Conversions API (CAPI) — server-side Purchase (PIX)
-- Adds: client metadata fields to orders + audit log table for pixel events (idempotency).

alter table public.orders
  add column if not exists client_ip text,
  add column if not exists client_user_agent text,
  add column if not exists checkout_url text;

create table if not exists public.pixel_event_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  platform text not null,          -- e.g. 'facebook'
  pixel_id text not null,
  event_name text not null,        -- e.g. 'Purchase'
  event_id text not null,          -- canonical for dedupe (order:<id>:Purchase)
  status text not null,            -- 'success' | 'failed' | 'skipped'
  response jsonb,
  error text,
  created_at timestamptz not null default now()
);

create unique index if not exists pixel_event_logs_unique_order_platform_pixel_event
  on public.pixel_event_logs(order_id, platform, pixel_id, event_name);

create index if not exists pixel_event_logs_order_id_idx
  on public.pixel_event_logs(order_id);

