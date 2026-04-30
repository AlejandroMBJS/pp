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

# Containers run as uid 1000 (audit F3). The bind-mounted data dir must match
# or the backend can't write uploads. Idempotent — chown is cheap.
if [[ -d ./data/backend ]]; then
  chown -R 1000:1000 ./data/backend
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

# Per-host overrides live in ./docker-compose.override.yml (NOT committed —
# different VPSs need different port mappings; e.g. a host with no front
# proxy binds gateway directly to :80, while one behind a host-level Caddy
# stays on :8888). Include it transparently when present.
COMPOSE_FILES=(-f docker-compose.prod.yml)
if [[ -f docker-compose.override.yml ]]; then
  COMPOSE_FILES+=(-f docker-compose.override.yml)
  echo "[deploy] including docker-compose.override.yml"
fi

echo "[deploy] docker compose up --build"
docker compose "${COMPOSE_FILES[@]}" --env-file .env up -d --build

# Probe whichever host port is mapped to the gateway's :80 (default 8888,
# 80 with the override).
HEALTH_PORT=$(docker compose "${COMPOSE_FILES[@]}" --env-file .env port gateway 80 2>/dev/null | awk -F: 'NR==1{print $NF}')
HEALTH_PORT="${HEALTH_PORT:-8888}"

echo "[deploy] healthcheck: polling http://localhost:${HEALTH_PORT}/healthz"
for i in $(seq 1 30); do
  sleep 2
  if curl -fsS "http://localhost:${HEALTH_PORT}/healthz" >/dev/null 2>&1; then
    echo "[deploy] OK healthy after $((i * 2))s"
    docker image prune -f >/dev/null 2>&1 || true
    echo "[deploy] done."
    exit 0
  fi
done

echo "[deploy][FATAL] /healthz never responded. Rolling back to ${PREV}"
git checkout "${PREV}"
docker compose "${COMPOSE_FILES[@]}" --env-file .env up -d --build
echo "[deploy] rollback applied. Investigate ${NEW} and retry."
exit 1
