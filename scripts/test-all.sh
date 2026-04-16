#!/usr/bin/env bash
# Run full pre-deploy test suite: backend build + tests, frontend typecheck + build,
# then spin up the docker stack and run Playwright smoke + CSP suites.
# Exits non-zero on any failure.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== [1/5] backend build & vet =="
(cd backend && go build ./... && go vet ./...)

echo "== [2/5] backend tests =="
# NOTE: requires a running PostgreSQL at localhost:5432 with DB 'arquicheck_test'.
# Skip with SKIP_BACKEND_TESTS=1 if unavailable.
if [ -z "${SKIP_BACKEND_TESTS:-}" ]; then
  (cd backend && go test ./...)
else
  echo "  (skipped: SKIP_BACKEND_TESTS=1)"
fi

echo "== [3/5] frontend typecheck =="
(cd frontend && ./node_modules/.bin/tsc --noEmit)

echo "== [4/5] docker compose up =="
docker compose up -d --build
# Wait for /healthz to respond.
for i in $(seq 1 30); do
  if curl -sf http://localhost:1212/healthz >/dev/null; then
    echo "  healthz OK after ${i}s"
    break
  fi
  sleep 1
  if [ "$i" = "30" ]; then
    echo "  healthz did not respond in 30s"
    docker compose logs --tail 80
    exit 1
  fi
done

echo "== [5/5] playwright e2e =="
trap 'docker compose down' EXIT
(cd frontend && PLAYWRIGHT_BASE_URL=http://localhost:1212 npm run test:e2e)

echo "== ALL GREEN =="
