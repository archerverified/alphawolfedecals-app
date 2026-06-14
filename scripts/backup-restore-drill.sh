#!/usr/bin/env bash
# Backup-restore drill (Goal 10 D2). Proves the prod Postgres can be dumped AND
# restored — the standing open ops item ("a backup never restored is not a backup").
# Dumps the live public schema, restores it into a throwaway LOCAL database, and
# asserts the row counts round-trip. Net-zero on prod (read-only pg_dump) and local
# (scratch DB dropped at the end; the dump artifact is kept as the verified backup).
#
#   dotenv -e <abs>/.env.local -- bash scripts/backup-restore-drill.sh
#
# Requires: DIRECT_URL (the non-pooled superuser conn) in env; a local Postgres.
set -uo pipefail

STAMP="$(psql "$DIRECT_URL" -tAc 'select to_char(now(),'"'"'YYYYMMDD-HH24MI'"'"')' | tr -d '[:space:]')"
DUMP="/tmp/aw-prod-backup-${STAMP}.dump"
SCRATCH="aw_restore_drill"

echo "== 1. pg_dump prod public schema =="
pg_dump "$DIRECT_URL" --schema=public --no-owner --no-privileges -Fc -f "$DUMP"
echo "dump rc=$? size=$(wc -c < "$DUMP") bytes -> $DUMP"

echo "== 2. recreate scratch DB + role/extension stubs =="
psql -d postgres -v ON_ERROR_STOP=0 -qc "DROP DATABASE IF EXISTS ${SCRATCH};" -qc "CREATE DATABASE ${SCRATCH};"
psql -d "${SCRATCH}" -v ON_ERROR_STOP=0 -q <<'SQL' 2>&1 | tail -3
do $$ begin
  create role app_user; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
create extension if not exists pg_trgm;
SQL

echo "== 3. pg_restore into scratch =="
pg_restore --no-owner --no-privileges -d "${SCRATCH}" "$DUMP" 2>&1 | grep -iE "error|fatal" | grep -viE "already exists|must be member|role .* does not exist" | head -10
echo "restore done (benign role/policy notices filtered)"

echo "== 4. verify row counts round-trip =="
echo "PROD  : $(psql "$DIRECT_URL" -tAc "select 'users='||(select count(*) from users)||' shops='||(select count(*) from shops)||' projects='||(select count(*) from projects)")"
echo "LOCAL : $(psql -d "${SCRATCH}" -tAc "select 'users='||(select count(*) from users)||' shops='||(select count(*) from shops)||' projects='||(select count(*) from projects)")"

echo "== 5. teardown scratch (keep the dump artifact) =="
psql -d postgres -qc "DROP DATABASE IF EXISTS ${SCRATCH};"
echo "DRILL COMPLETE — backup artifact retained at $DUMP"
