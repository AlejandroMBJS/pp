# Deployment & TLS Runbook

ProjectPulse is deployed as a set of Docker containers behind an Nginx gateway.
This document is the minimal end-to-end guide to get a fresh VPS from zero to
production, with TLS, backups and a rollback path.

## 0. Prerequisites

- Docker + Docker Compose v2 installed on the VPS.
- A DNS `A` record pointing at the VPS IP.
- Ports **80** and **443** open in the firewall.
- Git clone of this repo in `/srv/pp` (or wherever you prefer).

## 1. Environment file

Copy the template and fill it in:

```bash
cp .env.example .env
chmod 600 .env
```

Mandatory fields:

| Var | Notes |
|---|---|
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | DB creds. Password ≥ 20 chars. |
| `DB_SSLMODE` | `require` in prod (or `verify-full` if you mount a CA). |
| `JWT_SECRET` | `openssl rand -hex 32` — **min 32 bytes, app aborts otherwise**. |
| `PUBLIC_BASE_URL` | `https://your.domain` — no trailing slash. |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins. |

Stripe and Gemini variables are optional. If `STRIPE_SECRET_KEY` is empty,
billing is disabled and every tenant runs in trial-forever mode.

## 2. TLS with Let's Encrypt

The shipped `nginx/prod.conf` expects certificates at
`/etc/letsencrypt/live/<domain>/`. The simplest path is certbot on the host:

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d your.domain
```

Then mount the certs into the gateway container. Edit
`docker-compose.prod.yml`:

```yaml
  gateway:
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/prod.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - /var/www/certbot:/var/www/certbot:ro
```

Replace `REPLACE_DOMAIN` in `nginx/prod.conf` (two `ssl_certificate*` lines)
with your actual domain.

**Renewal**: certbot installs a systemd timer that auto-renews. After each
renewal you need to reload nginx:

```bash
sudo certbot renew --deploy-hook "docker compose -f /srv/pp/docker-compose.prod.yml exec gateway nginx -s reload"
```

## 3. First boot

```bash
docker compose -f docker-compose.prod.yml up --build -d
docker compose -f docker-compose.prod.yml logs -f backend
```

Watch for `projectpulse api listening on :8080`. If the process exits with
`JWT_SECRET must be at least 32 bytes`, fix `.env` and retry.

Smoke test:

```bash
curl -fs https://your.domain/healthz
```

## 4. Backups

Schedule the backup script via cron on the host:

```cron
30 3 * * * cd /srv/pp && BACKUP_DIR=/mnt/backups RETAIN=14 ./scripts/backup-db.sh >> /var/log/pp-backup.log 2>&1
```

Offsite: either rsync `/mnt/backups` to S3/B2/rsync.net nightly, or use
`restic` pointing at the same directory.

Test restore quarterly with `./scripts/restore-db.sh` into a staging DB.

## 5. Updates / rollback

Forward roll:

```bash
cd /srv/pp
git fetch && git checkout <tag-or-sha>
docker compose -f docker-compose.prod.yml up --build -d
```

Rollback:

```bash
git checkout <previous-tag>
docker compose -f docker-compose.prod.yml up --build -d
./scripts/restore-db.sh /mnt/backups/pp-<dbname>-<lastGood>.sql.gz   # only if schema changed
```

Tag releases (`git tag v1.2.3 && git push --tags`) so rollback targets are
discoverable.

## 6. Observability (gaps — see Sprint 4)

Current production does NOT have:

- Centralised logging (only `docker compose logs`)
- Metrics / Prometheus
- Alerting / uptime monitoring
- APM / error tracking

These are tracked in the remediation plan. Minimum viable interim:

```bash
# Tail error logs live
docker compose -f docker-compose.prod.yml logs -f --tail=200 backend | grep -i error
```

Consider adding an external uptime probe (UptimeRobot, BetterStack) hitting
`/healthz` every minute — it is free and catches most outages.

## 7. Security checklist before going live

- [ ] `.env` has `chmod 600` and is owned by a non-root user
- [ ] `JWT_SECRET` is 32+ random bytes, never the example value
- [ ] `DB_PASSWORD` is strong and not reused
- [ ] `DB_SSLMODE=require`
- [ ] `ALLOWED_ORIGINS` has no `localhost` entries
- [ ] TLS certificate installed and auto-renewing
- [ ] Port 5432 (Postgres) is NOT exposed externally (`docker-compose.prod.yml` uses `expose`, not `ports`)
- [ ] Backups run nightly and have been restored at least once
- [ ] Rollback procedure rehearsed on staging
