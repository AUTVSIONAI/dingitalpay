# Guia do Cliente — DingitalPay Platform (Self‑host)

Este guia é para **instalar, operar e atualizar** a plataforma na sua VPS.

## 1) Requisitos
- VPS Linux (recomendado Ubuntu 22.04+)
- Acesso `root` ou `sudo`
- Portas liberadas: `80` (HTTP) e `443` (HTTPS/TLS)
- Domínios apontados para o IP da VPS:
  - `app.seudominio.com` (plataforma)
- Docker + Docker Compose (plugin `docker compose`)

## 2) Instalação (1 comando)
Você receberá um link/token de instalação. No seu servidor, execute o comando fornecido no onboarding.

Ao finalizar, a instalação imprime:
- URL do app
- Status do deploy
- Próximos passos
 - (nas versões mais novas) credenciais do primeiro Admin

Arquivos principais:
- Install root: `/opt/dingitalpay` (padrão)
- Config: `/opt/dingitalpay/config/dingitalpay.env`
- Estado do install (diagnóstico): `/opt/dingitalpay/config/install-state.env`
- Logs: `/opt/dingitalpay/logs/`
- Releases: `/opt/dingitalpay/releases/`
- Release ativa: `/opt/dingitalpay/current/`

## 2.1) Primeiro Admin (login /admin)
Para usar o painel administrativo, você precisa de um usuário com role `admin`.

Nas versões mais novas, o instalador cria o primeiro Admin automaticamente e imprime:
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Ele também tenta salvar em:
- `/opt/dingitalpay/config/admin-credentials.txt` (permissão root)

Se você precisar criar manualmente (ex.: não apareceu no install), rode:
- `cd /opt/dingitalpay/current/deploy && docker compose --env-file /opt/dingitalpay/config/dingitalpay.env -f compose.yml exec -T dingitalpay-api-prod node dist/ops/bootstrapAdmin.js`

## 3) Subir/derrubar stack (manual)
Se precisar operar manualmente:
- Subir:
-  - `cd /opt/dingitalpay/current/deploy && docker compose --env-file /opt/dingitalpay/config/dingitalpay.env -f compose.yml up -d --build`
- Ver status:
-  - `cd /opt/dingitalpay/current/deploy && docker compose --env-file /opt/dingitalpay/config/dingitalpay.env -f compose.yml ps`
- Logs:
-  - `cd /opt/dingitalpay/current/deploy && docker compose --env-file /opt/dingitalpay/config/dingitalpay.env -f compose.yml logs -f --tail=200`

Observação:
- o worker de e-mail sobe por padrão junto com a stack
- isso é necessário para verificação de e-mail, campanhas, templates e automações SMTP

## 4) Atualizações (sem quebrar)
A forma recomendada é aplicar update **no servidor** (nunca no browser).

### 4.0) (Opcional) Aplicar pelo painel (/admin/updates) — runner server-side
O painel pode enfileirar um job e o servidor pode aplicar automaticamente, **desde que** o runner esteja habilitado.

1) Em `/opt/dingitalpay/config/dingitalpay.env`:
   - `UPDATES_RUNNER_ENABLED=true`
2) Suba o profile do runner:
   - `cd /opt/dingitalpay/current/deploy && docker compose --profile runner --env-file /opt/dingitalpay/config/dingitalpay.env -f compose.yml up -d --build`

Observação:
- Esse profile monta o Docker socket para conseguir aplicar o update (poderoso por natureza). Use apenas se você confia na instância e quer automação.
- o runner de updates é separado do worker de e-mail; o SMTP continua funcionando mesmo sem esse profile

## 4.5) SMTP (compatibilidade prática)
Para o SMTP funcionar corretamente na VPS:
- mantenha `EMAIL_WORKER_ENABLED=true`
- se o provedor exigir certificado válido, mantenha `SMTP_ALLOW_INSECURE_TLS=false` (recomendado)
- só use `SMTP_ALLOW_INSECURE_TLS=true` se o seu provedor SMTP tiver problema de cadeia/certificado e você souber o risco

### 4.1) Configurar token de updates
- `sudo dingitalpay-updater configure --token SEU_TOKEN_DE_UPDATES`

### 4.2) Verificar updates disponíveis
- `sudo dingitalpay-updater check`

### 4.3) Planejar (dry-run) um update
- `sudo dingitalpay-updater plan --version vX.Y.Z`
- Se o update estiver marcado como **breaking** ou exigir `minVersion`, o updater pode recusar por segurança:
  - `sudo dingitalpay-updater plan --version vX.Y.Z --force` (não recomendado; assume o risco)

### 4.4) Aplicar um update
- `sudo dingitalpay-updater apply --version vX.Y.Z`
- Para updates **breaking** (ou quando você precisa ignorar `minVersion`), use:
  - `sudo dingitalpay-updater apply --version vX.Y.Z --force` (não recomendado; assume o risco)

O updater faz:
- backup (configurável)
- migrations
- deploy (compose)
- reaplica a mesma topologia ativa da instância (`web`, `tls`, `tls-internal`, `runner`) para não trocar o modo de publicação no meio do update
- healthcheck
- rollback automático se falhar

Logs do updater:
- `/opt/dingitalpay/logs/updater.log`

## 5) Backup/rollback (recomendado)
Backups do updater (snapshots por timestamp):
- `/opt/dingitalpay/backups/snapshots/<TIMESTAMP>/`

Configuração (em `/opt/dingitalpay/config/dingitalpay.env`):
- `UPDATER_BACKUP_MODE=schema` (`none|schema|full`)
- `UPDATER_BACKUP_KEEP=10` (quantidade de snapshots)
- `UPDATER_HEALTHCHECK_TRIES=120`
- `UPDATER_HEALTHCHECK_SLEEP_SECONDS=1`

Rollback manual (se necessário):
- `sudo dingitalpay-updater rollback`

## 6) TLS/HTTPS
A plataforma pode iniciar em HTTP (porta 80). Para produção, recomenda-se HTTPS/TLS (porta 443) com certificado válido.

### 6.1) TLS com Caddy (recomendado para leigos)
O bundle inclui Caddy (automatic HTTPS/Let's Encrypt) no `docker compose` via profile `tls`.

Pré-requisitos:
- `APP_HOST` apontando para o IP da VPS (DNS OK)
- portas `80` e `443` liberadas

Como habilitar:
1) Edite `/opt/dingitalpay/config/dingitalpay.env`:
   - `TLS_ENABLED=true`
   - `WEB_PORT=8080` (obrigatório quando usar Caddy, evita conflito com 80/443)
   - (opcional) `TLS_EMAIL=seu-email@dominio.com`
2) Suba com o profile:
   - `cd /opt/dingitalpay/current/deploy && docker compose --profile tls --env-file /opt/dingitalpay/config/dingitalpay.env -f compose.yml up -d --build`

Observação:
- Se a porta 443 já estiver em uso por Nginx/Traefik/Cloudflare Tunnel, deixe `TLS_ENABLED=false` e use o seu proxy externo.

## 7) Suporte (quando pedir ajuda)
Ao abrir chamado, envie:
- Versão atual: `readlink -f /opt/dingitalpay/current`
- Últimas linhas: `tail -n 200 /opt/dingitalpay/logs/updater.log`
- Status do compose: `docker ps` e `docker compose ps`
