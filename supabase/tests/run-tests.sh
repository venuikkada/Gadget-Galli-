#!/usr/bin/env bash
# Applies every migration + the demo seed to a throwaway local Postgres 16 and runs the SQL tests.
# No Docker needed. Usage:
#   bash supabase/tests/run-tests.sh            # run all tests
#   KEEP=1 bash supabase/tests/run-tests.sh     # leave the database running afterwards (prints how to connect)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SUPA="$(cd "$HERE/.." && pwd)"
PGBIN="${PGBIN:-}"
if [ -z "$PGBIN" ]; then
  for d in /usr/lib/postgresql/17/bin /usr/lib/postgresql/16/bin /usr/local/opt/postgresql@16/bin /opt/homebrew/opt/postgresql@16/bin; do
    if [ -x "$d/initdb" ]; then PGBIN="$d"; break; fi
  done
fi
if [ -z "$PGBIN" ] && command -v initdb >/dev/null 2>&1; then PGBIN="$(dirname "$(command -v initdb)")"; fi
if [ -z "$PGBIN" ]; then echo "initdb not found; install PostgreSQL 15+ or set PGBIN" >&2; exit 1; fi

PORT="${TEST_PGPORT:-54329}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/gg-pgtest-XXXXXX")"
RUNAS=()
if [ "$(id -u)" = "0" ]; then
  RUNAS=(runuser -u postgres --)
  chown postgres "$WORK"
fi

"${RUNAS[@]}" "$PGBIN/initdb" -D "$WORK/data" -U postgres -A trust -E UTF8 --locale=C.UTF-8 >/dev/null
"${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses='localhost' -c timezone=UTC" -l "$WORK/log" -w start >/dev/null

cleanup() {
  if [ "${KEEP:-0}" != "1" ]; then
    "${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true
    rm -rf "$WORK"
  fi
}
trap cleanup EXIT

PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -d postgres -c "create database gg" >/dev/null
PSQL+=(-d gg)

echo "▸ shim (local stand-ins for Supabase auth/storage)"
"${PSQL[@]}" -f "$HERE/shim.sql" >/dev/null

for f in "$SUPA"/migrations/*.sql; do
  echo "▸ migration $(basename "$f")"
  "${PSQL[@]}" -f "$f" >/dev/null
done

echo "▸ seed"
"${PSQL[@]}" -f "$SUPA/seed.sql" >/dev/null

failed=0
for t in "$HERE"/*.test.sql; do
  [ -e "$t" ] || continue
  name="$(basename "$t")"
  if out=$("${PSQL[@]}" -o /dev/null -f "$t" 2>&1); then
    echo "✔ $name"
    if [ -n "${VERBOSE:-}" ]; then echo "$out"; fi
  else
    echo "✘ $name"
    echo "$out" | sed 's/^/    /'
    failed=1
  fi
done

if [ "${KEEP:-0}" = "1" ]; then
  echo
  echo "Database left running:  psql -h $WORK -p $PORT -U postgres -d gg"
  echo "Stop it with:           ${RUNAS[*]} $PGBIN/pg_ctl -D $WORK/data stop"
fi
exit $failed
