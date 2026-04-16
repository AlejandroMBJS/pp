# Operations runbook

## Backups

Nightly cron on the VPS writes:

- `/root/backups/projectpulse/pg_YYYYMMDD_HHMM.sql.gz` — Postgres dump
- `/root/backups/projectpulse/uploads_YYYYMMDD_HHMM.tar.gz` — uploads dir

Retention: 7 days, governed by `/root/backups/backup-all.sh`.

### Restore Postgres from a nightly dump

```bash
ssh root@72.62.201.134
cd /root/pp
# Stop the app to prevent writes during restore.
docker compose -f docker-compose.prod.yml stop backend frontend

# Pick the dump.
ls -lht /root/backups/projectpulse/pg_*.sql.gz | head

# Drop + recreate schema (DB container stays up).
gunzip -c /root/backups/projectpulse/pg_YYYYMMDD_HHMM.sql.gz \
  | docker exec -i pp-db-1 psql -U "$DB_USER" -d "$DB_NAME"
# Credentials live in /root/pp/.env — source it first if needed:
#   set -a; . /root/pp/.env; set +a

docker compose -f docker-compose.prod.yml up -d backend frontend
curl -fs http://localhost:8888/healthz
```

### Restore uploads

```bash
cd /root/pp/data/backend
tar -xzf /root/backups/projectpulse/uploads_YYYYMMDD_HHMM.tar.gz
```

## Incident: backend crashloop / bad gateway

Symptoms: nginx returns 502, `docker ps` shows `pp-backend-1` restarting.

1. `docker logs pp-backend-1 --tail 100` — look for "JWT_SECRET must be at least 32 bytes" or DB connection errors.
2. If JWT_SECRET missing: verify `/root/pp/.env` has `JWT_SECRET`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. Rsync must exclude `.env`.
3. If DB password mismatch: peer-auth into db and reset.
   ```bash
   docker exec -it pp-db-1 psql -U "$DB_USER" -d "$DB_NAME"
   ALTER USER arquicheck WITH PASSWORD 'new-password';
   ```
   Update `.env`, then `docker compose -f docker-compose.prod.yml up -d backend`.
4. After recreating `pp-backend-1`, reload nginx so the gateway picks up the new container IP:
   ```bash
   docker compose -f docker-compose.prod.yml restart gateway
   ```
   `nginx -s reload` from inside the container sometimes does NOT pick up bind-mount edits — prefer `restart gateway`.

## Deploy

Local → VPS rsync then rebuild:

```bash
rsync -az --delete \
  --exclude='.git' --exclude='node_modules' --exclude='frontend/.next' \
  --exclude='.env' --exclude='data/' --exclude='backups/' \
  /path/to/pp/ root@72.62.201.134:/root/pp/

ssh root@72.62.201.134 \
  'cd /root/pp && docker compose -f docker-compose.prod.yml up -d --build backend frontend'
```

**Critical rsync excludes:** `.env`, `data/`, `backups/`. Omitting any of these wipes prod state.

## Monitoring

- `curl http://72.62.201.134:8888/healthz` — backend health.
- `docker compose -f docker-compose.prod.yml ps` — container state.
- `docker stats` — CPU/mem.
- nginx access log: `docker exec pp-gateway-1 tail -f /var/log/nginx/access.log`.
