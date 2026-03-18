create table if not exists public.product_entitlements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  seller_id uuid not null,
  buyer_email text not null,
  normalized_buyer_email text not null,
  user_id uuid references public.users(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  revoked_reason text not null default '',
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id, product_id)
);

create index if not exists idx_product_entitlements_user_status
  on public.product_entitlements(user_id, status);

create index if not exists idx_product_entitlements_email_status
  on public.product_entitlements(normalized_buyer_email, status);

create index if not exists idx_product_entitlements_product_status
  on public.product_entitlements(product_id, status);

do $$
begin
  if exists (
    select 1
    from pg_proc
    where proname = 'update_updated_at_column'
      and pg_function_is_visible(oid)
  ) then
    if not exists (
      select 1
      from pg_trigger
      where tgname = 'update_product_entitlements_updated_at'
    ) then
      create trigger update_product_entitlements_updated_at
        before update on public.product_entitlements
        for each row
        execute function public.update_updated_at_column();
    end if;
  end if;
end $$;

with approved_items as (
  select
    o.id as order_id,
    o.seller_id,
    o.product_id,
    o.buyer_email,
    lower(trim(o.buyer_email)) as normalized_buyer_email
  from public.orders o
  where o.status = 'approved'
    and trim(coalesce(o.buyer_email, '')) <> ''
  union
  select
    o.id as order_id,
    o.seller_id,
    oi.product_id,
    o.buyer_email,
    lower(trim(o.buyer_email)) as normalized_buyer_email
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.status = 'approved'
    and trim(coalesce(o.buyer_email, '')) <> ''
)
insert into public.product_entitlements (
  order_id,
  product_id,
  seller_id,
  buyer_email,
  normalized_buyer_email,
  user_id,
  status,
  granted_at,
  revoked_at,
  revoked_reason
)
select
  i.order_id,
  i.product_id,
  i.seller_id,
  i.buyer_email,
  i.normalized_buyer_email,
  u.id,
  'active',
  now(),
  null,
  ''
from approved_items i
left join public.users u
  on lower(u.email) = i.normalized_buyer_email
on conflict (order_id, product_id)
do update set
  seller_id = excluded.seller_id,
  buyer_email = excluded.buyer_email,
  normalized_buyer_email = excluded.normalized_buyer_email,
  user_id = coalesce(public.product_entitlements.user_id, excluded.user_id),
  status = 'active',
  revoked_at = null,
  revoked_reason = '',
  updated_at = now();
