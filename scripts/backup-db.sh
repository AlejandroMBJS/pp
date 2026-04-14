#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# backup-db.sh — Dump the ProjectPulse Postgres DB from the `db` compose service
# to a timestamped, compressed file. Keeps the last RETAIN days of backups.
#
# Usage:
#   ./scripts/backup-db.sh            # backs up to ./data/backups
#   BACKUP_DIR=/mnt/backups ./scripts/backup-db.sh
#
# Cron (daily at 03:30, keep 14 days):
#   30 3 * * * cd /srv/pp && BACKUP_DIR=/mnt/backups RETAIN=14 ./scripts/backup-db.sh >> /var/log/pp-backup.log 2>&1
# -----------------------------------------------------------------------------
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./data/backups}"
RETAIN="${RETAIN:-14}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DB_SERVICE="${DB_SERVICE:-db}"

# Load .env for DB_USER / DB_NAME if present.
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

: "${DB_USER:?DB_USER must be set (via .env or env var)}"
: "${DB_NAME:?DB_NAME must be set (via .env or env var)}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/pp-${DB_NAME}-${stamp}.sql.gz"

echo "[backup-db] dumping ${DB_NAME} → ${out}"
docker compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --clean --if-exists \
  | gzip -9 > "$out"

size=$(du -h "$out" | cut -f1)
echo "[backup-db] wrote ${out} (${size})"

# Retention
find "$BACKUP_DIR" -type f -name 'pp-*.sql.gz' -mtime +"$RETAIN" -print -delete \
  | sed 's/^/[backup-db] pruned /' || true

echo "[backup-db] done."
