#!/usr/bin/env bash
set -euo pipefail

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"

if [[ -z "${PGHOST:-}" || -z "${PGUSER:-}" || -z "${PGPASSWORD:-}" || -z "${PGDATABASE:-}" ]]; then
  echo "Missing PGHOST/PGUSER/PGPASSWORD/PGDATABASE env vars" >&2
  exit 1
fi

echo "Running migrations on ${PGDATABASE}..."

psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
SQL

shopt -s nullglob
files=("${MIGRATIONS_DIR}"/*.sql)
IFS=$'\n' files=($(printf '%s\n' "${files[@]}" | sort))

for file in "${files[@]}"; do
  filename="$(basename "$file")"
  applied="$(psql -v ON_ERROR_STOP=1 -tAc "SELECT 1 FROM public.schema_migrations WHERE filename='${filename}'")"
  if [[ "$applied" == "1" ]]; then
    echo "==> skip ${filename}"
    continue
  fi

  echo "==> apply ${filename}"
  psql -v ON_ERROR_STOP=1 -f "$file"
  psql -v ON_ERROR_STOP=1 -c "INSERT INTO public.schema_migrations(filename) VALUES ('${filename}')"
done

echo "Migrations complete."
