alter table public.orders
  add column if not exists meta_fbc text,
  add column if not exists meta_fbp text;

create index if not exists orders_meta_fbc_idx
  on public.orders(meta_fbc)
  where meta_fbc is not null;

create index if not exists orders_meta_fbp_idx
  on public.orders(meta_fbp)
  where meta_fbp is not null;

alter table public.pixel_event_logs
  add column if not exists meta_fbc_present boolean not null default false,
  add column if not exists meta_fbp_present boolean not null default false;
