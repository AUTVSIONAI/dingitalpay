create type public.affiliate_commission_status as enum ('pending', 'available', 'canceled', 'paid');

create table if not exists public.affiliate_programs (
  product_id uuid primary key references public.products(id) on delete cascade,
  enabled boolean not null default false,
  commission_percent numeric(5,2) not null default 30,
  cookie_days integer not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger update_affiliate_programs_updated_at
  before update on public.affiliate_programs
  for each row execute function public.update_updated_at_column();

create table if not exists public.affiliate_links (
  id uuid not null default gen_random_uuid() primary key,
  code text not null unique,
  product_id uuid not null references public.products(id) on delete cascade,
  offer_id uuid references public.product_offers(id) on delete set null,
  affiliate_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists affiliate_links_affiliate_user_id_idx
  on public.affiliate_links(affiliate_user_id);

create index if not exists affiliate_links_product_id_idx
  on public.affiliate_links(product_id);

alter table public.orders
  add column if not exists affiliate_link_id uuid references public.affiliate_links(id) on delete set null,
  add column if not exists affiliate_user_id uuid references public.users(id) on delete set null;

create index if not exists orders_affiliate_user_id_idx
  on public.orders(affiliate_user_id)
  where affiliate_user_id is not null;

create index if not exists orders_affiliate_link_id_idx
  on public.orders(affiliate_link_id)
  where affiliate_link_id is not null;

create table if not exists public.affiliate_commissions (
  id uuid not null default gen_random_uuid() primary key,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  affiliate_link_id uuid references public.affiliate_links(id) on delete set null,
  affiliate_user_id uuid not null references public.users(id) on delete cascade,
  seller_id uuid not null,
  product_id uuid not null references public.products(id) on delete cascade,
  commission_percent numeric(5,2) not null default 0,
  commission_amount numeric(12,2) not null default 0,
  status public.affiliate_commission_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger update_affiliate_commissions_updated_at
  before update on public.affiliate_commissions
  for each row execute function public.update_updated_at_column();

create index if not exists affiliate_commissions_affiliate_user_id_idx
  on public.affiliate_commissions(affiliate_user_id);

create index if not exists affiliate_commissions_product_id_idx
  on public.affiliate_commissions(product_id);

