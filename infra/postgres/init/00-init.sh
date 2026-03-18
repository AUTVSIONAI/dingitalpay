#!/usr/bin/env sh
set -eu

psql -v ON_ERROR_STOP=1 --username "postgres" <<SQL
-- Extensions commonly used by the existing schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Roles
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dingitalpay_migrator') THEN
    CREATE ROLE dingitalpay_migrator LOGIN PASSWORD '${DINGITALPAY_MIGRATOR_PASSWORD}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dingitalpay_app') THEN
    CREATE ROLE dingitalpay_app LOGIN PASSWORD '${DINGITALPAY_APP_PASSWORD}';
  END IF;
END
\$\$;

-- Databases (owned by migrator)
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '${DINGITALPAY_PROD_DB}') THEN
    PERFORM dblink_exec('dbname=' || current_database(), 'CREATE DATABASE ${DINGITALPAY_PROD_DB} OWNER dingitalpay_migrator');
  END IF;
EXCEPTION WHEN undefined_function THEN
  -- Fallback if dblink is unavailable (shouldn't happen on postgres image, but keep safe):
  NULL;
END
\$\$;
SQL

# Creating databases via psql needs to run outside a transaction; use createdb for portability.
if ! psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DINGITALPAY_PROD_DB}'" | grep -q 1; then
  createdb -U postgres -O dingitalpay_migrator "${DINGITALPAY_PROD_DB}"
fi
if ! psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DINGITALPAY_PROVISIONING_DB:-dingitalpay_provisioning}'" | grep -q 1; then
  createdb -U postgres -O dingitalpay_migrator "${DINGITALPAY_PROVISIONING_DB:-dingitalpay_provisioning}"
fi
if [ -n "${DINGITALPAY_DEMO_DB:-}" ]; then
  if ! psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DINGITALPAY_DEMO_DB}'" | grep -q 1; then
    createdb -U postgres -O dingitalpay_migrator "${DINGITALPAY_DEMO_DB}"
  fi
fi

# Grants for app role (run per-db)
DBS="${DINGITALPAY_PROD_DB} ${DINGITALPAY_PROVISIONING_DB:-dingitalpay_provisioning}"
if [ -n "${DINGITALPAY_DEMO_DB:-}" ]; then
  DBS="${DBS} ${DINGITALPAY_DEMO_DB}"
fi
for db in ${DBS}; do
  psql -v ON_ERROR_STOP=1 -U postgres -d "${db}" <<SQL
GRANT CONNECT ON DATABASE ${db} TO dingitalpay_app;
GRANT USAGE, CREATE ON SCHEMA public TO dingitalpay_migrator;
GRANT USAGE ON SCHEMA public TO dingitalpay_app;

ALTER DEFAULT PRIVILEGES FOR ROLE dingitalpay_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dingitalpay_app;
ALTER DEFAULT PRIVILEGES FOR ROLE dingitalpay_migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO dingitalpay_app;
ALTER DEFAULT PRIVILEGES FOR ROLE dingitalpay_migrator IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO dingitalpay_app;
SQL
done
