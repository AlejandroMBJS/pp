#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# vps-deploy.sh — Reproducible deploy by git ref.
#
# Runs on the VPS, inside /srv/projpul. Replaces the old rsync-from-local flow.
# Usage:
#   ./scripts/vps-deploy.sh                # deploy tip of main
#   ./scripts/vps-deploy.sh v2026.04.25-1  # deploy a specific tag
#   ./scripts/vps-deploy.sh <sha>          # deploy a specific commit
#
# Safety:
#   1. DB dump before any docker touch (best-effort; continues on backup error).
#   2. Remembers the previous commit so rollback is one `git checkout` away.
#   3. Polls /healthz for 60 s after `up --build`. If unhealthy, rolls back.
#
# Requires: docker compose, curl, the repo cloned at /srv/projpul with .env in
# place (including COMPOSE_PROJECT_NAME=pp so we reuse the existing stack).
# -----------------------------------------------------------------------------
set -euo pipefail

REF="${1:-main}"
cd "$(dirname "$0")/.."
REPO_ROOT=$(pwd)

if [[ ! -f .env ]]; then
  echo "[deploy] FATAL: missing .env at ${REPO_ROOT}/.env" >&2
  exit 2
fi

echo "[deploy] $(date -u +%FT%TZ) — deploying ref '${REF}' from ${REPO_ROOT}"

echo "[deploy] backing up DB"
if ! ./scripts/backup-db.sh >/dev/null 2>&1; then
  echo "[deploy][warn] DB backup failed — continuing anyway"
fi

echo "[deploy] fetching origin"
git fetch --tags origin

PREV=$(git rev-parse HEAD)
echo "[deploy] previous HEAD: ${PREV}"

echo "[deploy] checking out ${REF}"
git checkout "${REF}"
# Fast-forward if REF is a branch tip; no-op for tags/SHAs.
git pull --ff-only origin "${REF}" 2>/dev/null || true

NEW=$(git rev-parse HEAD)
echo "[deploy] new HEAD: ${NEW}"

echo "[deploy] docker compose up --build"
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

echo "[deploy] healthcheck: polling http://localhost:8888/healthz"
for i in $(seq 1 30); do
  sleep 2
  if curl -fsS http://localhost:8888/healthz >/dev/null 2>&1; then
    echo "[deploy] OK healthy after $((i * 2))s"
    docker image prune -f >/dev/null 2>&1 || true
    echo "[deploy] done."
    exit 0
  fi
done

echo "[deploy][FATAL] /healthz never responded. Rolling back to ${PREV}"
git checkout "${PREV}"
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
echo "[deploy] rollback applied. Investigate ${NEW} and retry."
exit 1
