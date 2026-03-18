# DingitalPay — Monorepo

Este repositório contém todos os projetos que existem em `/dingitalpay` na VPS, organizados por pasta:

- `prod/` — Plataforma (produção)
- `demo/` — Plataforma (demo)
- `lp/` — Landing pages (mock, sem Supabase)
- `onboarding/` — Onboarding (app independente)
- `docs-site/` — Docs públicas (subdomínio `docs.dingitalpay.com`)
- `docs/` — Planejamentos e notas

Cada pasta é um projeto independente (com `package.json` próprio).

## Arquitetura (sem Supabase)
- Banco: PostgreSQL self-host (Docker) com 2 DBs (`dingitalpay_prod`, `dingitalpay_demo`) + migrations em `db/migrations/`.
- Backend: API Node/Fastify em `api/` (Auth + DB + Storage + Functions/Webhooks).
- Front: Vite build estático (Nginx). O front chama **sempre** `same-origin` em `/api/*` (proxy reverso).

## Subir infra na VPS (prod + demo)
1) Criar `infra/.env` (use `infra/.env.example` como base).
2) Subir Postgres + APIs:
   - `cd /dingitalpay/infra && docker compose --env-file .env -f compose.yml up -d --build`
3) Rodar migrations (uma vez ou quando atualizar):
   - `cd /dingitalpay/infra && docker compose --env-file .env -f compose.yml --profile migrate up --abort-on-container-exit migrate_prod migrate_demo`

## Nginx (VPS)
- `app.dingitalpay.com` e `demo.dingitalpay.com` servem SPA e fazem proxy de `location ^~ /api/` para as APIs locais.
- `docs.dingitalpay.com` serve o site de documentação (ex.: `/contexto`).

## Deploy do front (VPS)
- Prod:
  - `cd /dingitalpay/prod && npm ci && npm run build && rsync -a --delete dist/ /var/www/dingitalpay/prod/current/`
- Demo:
  - `cd /dingitalpay/demo && npm ci && npm run build && rsync -a --delete dist/ /var/www/dingitalpay/demo/current/`
- Docs:
  - `cd /dingitalpay/docs-site && npm ci && npm run build && rsync -a --delete dist/ /var/www/dingitalpay/docs/current/`

## Onboarding “1 comando” (cliente) + Updates por token
- Provisioning gera/valida tokens e entrega releases via `install.sh`/`update.sh` (app separada em `provisioning/`).
- Release build: `tools/release/build-release.sh vX.Y.Z` (gera `release.json`, `SHA256SUMS` e, opcionalmente, assina com minisign via `MINISIGN_SECRET_KEY_PATH`).
- Publish: `tools/release/publish-to-provisioning.sh vX.Y.Z` (copia artefatos + registra release + gera `updates.json`).
- Updater no servidor do cliente: `/usr/local/bin/dingitalpay-updater` (instalado pelo `install.sh`).

## Rotinas operacionais (VPS)
- Scripts: `infra/ops/backup-postgres.sh` e `infra/ops/cleanup-orders.sh`
- Cron:
  - `/etc/cron.d/dingitalpay-postgres-backup`
  - `/etc/cron.d/dingitalpay-cleanup-orders`

## Migração de dados (quando tiver as credenciais do Supabase)
- Script: `db/tools/migrate-from-supabase.sh`
- Requer: `SOURCE_DATABASE_URL` e `TARGET_DATABASE_URL` (ex.: URL do DB do Supabase e URL do Postgres local exposto/atingível).

## Stack “entrega” (Docker-only, plug-and-play)
- Pasta: `deploy/`
- `cd /dingitalpay/deploy && cp .env.example .env` (preencher)
- `docker compose --env-file .env -f compose.yml up -d --build`
- Observação: o `deploy/compose.yml` expõe apenas HTTP (porta 80). Para produção, usar TLS (proxy externo, Nginx/Traefik/Caddy, ou adaptar o compose).
