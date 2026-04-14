#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# restore-db.sh — Restore a ProjectPulse backup produced by backup-db.sh.
#
# USAGE:
#   ./scripts/restore-db.sh path/to/pp-arquicheck-20260412T033000Z.sql.gz
#
# Requires a confirmation prompt — this DROPs existing tables before load.
# -----------------------------------------------------------------------------
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <backup-file.sql.gz>" >&2
  exit 2
fi

FILE="$1"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DB_SERVICE="${DB_SERVICE:-db}"

if [[ ! -f "$FILE" ]]; then
  echo "error: $FILE not found" >&2
  exit 1
fi

if [[ -f .env ]]; then
  set -a; . ./.env; set +a
fi

: "${DB_USER:?DB_USER must be set}"
: "${DB_NAME:?DB_NAME must be set}"

echo "About to restore $FILE into database '$DB_NAME' as user '$DB_USER'."
echo "This will DROP existing objects via pg_dump --clean. Data WILL be overwritten."
read -r -p "Type the database name ($DB_NAME) to confirm: " confirm
if [[ "$confirm" != "$DB_NAME" ]]; then
  echo "aborted." >&2
  exit 1
fi

gunzip -c "$FILE" | docker compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
  psql -U "$DB_USER" -d "$DB_NAME"

echo "[restore-db] done."
