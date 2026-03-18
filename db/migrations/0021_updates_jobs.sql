-- Jobs for applying platform updates (server-side runner).
-- Safe-by-default: execution requires explicit enablement via env/runner.

create table if not exists public.updates_jobs (
  id uuid primary key default gen_random_uuid(),
  product_key text not null default 'dingitalpay-platform',
  target_version text not null,
  status text not null default 'queued' check (status in ('queued','running','success','failed','canceled')),
  attempts int not null default 0,
  max_attempts int not null default 1,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  requested_by_user_id uuid references public.users(id) on delete set null,
  last_error text,
  log text
);

create index if not exists updates_jobs_created_idx on public.updates_jobs (created_at desc);
create index if not exists updates_jobs_status_created_idx on public.updates_jobs (status, created_at desc);
create index if not exists updates_jobs_target_version_idx on public.updates_jobs (target_version);
