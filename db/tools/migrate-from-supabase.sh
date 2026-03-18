#!/usr/bin/env bash
set -euo pipefail

# Migrates data from a Supabase-managed Postgres to the self-host Postgres.
# This intentionally skips auth-related tables because this repo replaces Supabase Auth.
#
# Usage:
#   SOURCE_DATABASE_URL='postgresql://...' TARGET_DATABASE_URL='postgresql://...' ./db/tools/migrate-from-supabase.sh
#
# Notes:
# - This imports ONLY public schema data (no auth/storage).
# - It skips user/auth tables that differ in this repo:
#   public.users, public.profiles, public.user_roles, public.sessions, public.password_reset_tokens, public.email_verification_tokens

SOURCE_DATABASE_URL="${SOURCE_DATABASE_URL:-}"
TARGET_DATABASE_URL="${TARGET_DATABASE_URL:-}"

if [[ -z "${SOURCE_DATABASE_URL}" || -z "${TARGET_DATABASE_URL}" ]]; then
  echo "Missing SOURCE_DATABASE_URL or TARGET_DATABASE_URL." >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "${tmp_dir}"' EXIT

dump_file="${tmp_dir}/public-data.sql"

EXCLUDES=(
  "--exclude-table-data=public.users"
  "--exclude-table-data=public.profiles"
  "--exclude-table-data=public.user_roles"
  "--exclude-table-data=public.sessions"
  "--exclude-table-data=public.password_reset_tokens"
  "--exclude-table-data=public.email_verification_tokens"
  "--exclude-table-data=public.schema_migrations"
)

echo "==> Dumping Supabase public schema data (excluding auth/user tables)..."
docker run --rm postgres:16-alpine \
  pg_dump "${SOURCE_DATABASE_URL}" \
  --data-only \
  --schema=public \
  --no-owner \
  --no-privileges \
  --disable-triggers \
  "${EXCLUDES[@]}" \
  > "${dump_file}"

echo "==> Importing into target database..."
docker run --rm -i postgres:16-alpine \
  psql "${TARGET_DATABASE_URL}" \
  -v ON_ERROR_STOP=1 \
  < "${dump_file}"

echo "OK migrated public data (users/auth tables were skipped)."

