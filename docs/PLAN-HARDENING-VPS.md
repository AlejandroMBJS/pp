# Hardening Plan — ProjectPulse VPS (versión exhaustiva)

## Context

Ronda de hardening post-MVP para el despliegue en VPS (docker compose prod, Nginx detrás de Cloudflare, Postgres en contenedor, Next.js 15 App Router + backend Go/Chi). Seis ejes independientes pero agrupados porque todos tocan infraestructura, observabilidad, consistencia de contenido o capacidad de operar el sistema a largo plazo.

**Objetivos de alto nivel:**
1. **No perder datos** — backups verificados con restore drill documentado.
2. **No quedarse sin disco** — log rotation en todos los servicios.
3. **Saber cuándo algo se cae** — healthcheck significativo + UptimeRobot externo.
4. **Investor-ready bilingüe** — i18n completo es/en con selector y persistencia.
5. **Single source of truth para pricing** — evitar que cambiar un precio requiera tocar 3 archivos.
6. **Rate limiting que funcione detrás de Cloudflare** — la zone actual es decorativa porque usa la IP del proxy.

**Constraint durable del proyecto:** todo se construye dentro de Docker. El VPS no tiene Go/Node en el host; cualquier dependencia nueva se añade vía `package.json` / `go.mod` y rebuild del contenedor.

**Decisiones confirmadas con el usuario:**
- **Cloudflare** está delante del nginx del compose → usar `CF-Connecting-IP` y rangos oficiales de Cloudflare.
- **i18n scope completo** (fases 1+2+3): toda la SPA, metadata, modales, tooltips, toasts. ~3000 líneas de TSX a revisar.
- **Plans centralizado — mínimo viable**: no endpoint nuevo. Un único archivo TS en el frontend (`frontend/lib/plans.ts`) que se sincroniza a mano con `backend/internal/billing/plans.go` (el backend ya es single source para límites/features).
- **Rate limit**: solo arreglar `auth_zone` existente para que use IP real. No añadir zone nueva para `/api/*`.

---

## 1. Backups de Postgres en el VPS

### Estado actual verificado
- `scripts/backup-db.sh` (46 líneas, untracked) — funcional. Usa `docker compose -f docker-compose.prod.yml exec -T db pg_dump -U $DB_USER -d $DB_NAME --no-owner --clean --if-exists | gzip -9`, escribe en `$BACKUP_DIR` (default `./data/backups`), retención `$RETAIN` días (default 14), carga `.env` automáticamente.
- `scripts/restore-db.sh` (45 líneas, untracked) — con prompt de confirmación antes de hacer drop/restore.
- `docker-compose.prod.yml` **no tiene** servicio de backup ni cron.
- `docs/DEPLOYMENT.md` existe pero no cubre backups (verificar su contenido al implementar para no duplicar).
- No hay documentación de restore drill, ni verificación de integridad de los dumps, ni envío off-site.

### Sub-plan 1.1 — Commitear los scripts
**Pasos:**
1. Leer ambos scripts completos una vez más para confirmar que no tienen paths hardcoded al entorno local del usuario (ya verificado — usan variables de entorno y rutas relativas).
2. `chmod +x scripts/backup-db.sh scripts/restore-db.sh`.
3. Añadir al commit con un mensaje claro: "add postgres backup/restore scripts".
4. **No** añadir `data/backups/` al repo — debe estar en `.gitignore` (verificar; si no, añadirlo).

### Sub-plan 1.2 — Cron en el host del VPS
**Decisión de diseño:** cron del host, no sidecar en el compose.
- **Por qué host cron y no sidecar**: menos complejidad, no depende del ciclo de vida de los contenedores, más fácil de debuggear con `journalctl -u cron`, y el script ya está diseñado para invocarse con `docker compose exec` desde fuera.
- **Por qué no GitHub Actions / CI**: el VPS es privado, el runner no tiene acceso a Postgres sin abrir el puerto. Ruta mala.

**Pasos en el VPS (documentar, no ejecutar desde aquí):**
1. Crear directorio de backups fuera del working dir: `sudo mkdir -p /srv/pp-backups && sudo chown $USER:$USER /srv/pp-backups`.
   - **Por qué fuera del working dir**: evita que `git clean -xdf` los borre por accidente; evita que `docker compose down -v` toque backups si alguien confunde volúmenes.
2. Crear log dir: `sudo mkdir -p /var/log && sudo touch /var/log/pp-backup.log && sudo chown $USER:$USER /var/log/pp-backup.log`.
3. Añadir entrada de crontab (`crontab -e`):
   ```
   30 3 * * * cd /srv/pp && BACKUP_DIR=/srv/pp-backups RETAIN=14 ./scripts/backup-db.sh >> /var/log/pp-backup.log 2>&1
   ```
   - Hora: 03:30 UTC (baja actividad).
   - Retención: 14 días. Suficiente para detectar corrupción tardía sin llenar disco con un proyecto chico.

### Sub-plan 1.3 — Documentación en `docs/DEPLOYMENT.md`
**Nueva sección "Backups" con:**
1. **Setup inicial** (los 3 pasos de 1.2 arriba, copypasteables).
2. **Ejecución manual**: `cd /srv/pp && ./scripts/backup-db.sh` — caso de uso: antes de hacer una migración de schema o un deploy arriesgado.
3. **Listado**: `ls -lh /srv/pp-backups/ | tail -20`.
4. **Restore drill** — el item más crítico. Pasos:
   - Parar el backend (no la db): `docker compose -f docker-compose.prod.yml stop backend`.
   - Correr: `./scripts/restore-db.sh /srv/pp-backups/pp-<db>-<stamp>.sql.gz`.
   - Confirmar el prompt.
   - Reiniciar backend: `docker compose -f docker-compose.prod.yml start backend`.
   - Verificar `/healthz` y login con una cuenta conocida.
5. **Verificación post-backup** (añadir al final del script o como sanity check manual):
   - `gunzip -t /srv/pp-backups/pp-*.sql.gz` — chequea que el gzip está íntegro.
   - `zcat /srv/pp-backups/pp-*.sql.gz | head -50 | grep 'PostgreSQL database dump'` — confirma que es un dump válido.
6. **Nota TODO (no implementar ahora)**: envío off-site con `rclone` a S3/B2/Backblaze. Dejar documentado como siguiente paso de hardening.

### Sub-plan 1.4 — Test del restore en staging antes de confiar en producción
**Por qué:** un backup no es un backup hasta que haces restore y funciona. Dejarlo como checklist en el docs.

**Procedimiento:**
1. Levantar un docker compose local con volumen vacío: `docker compose -f docker-compose.prod.yml up db`.
2. Copiar un backup real al host local.
3. Crear `.env` local apuntando al compose.
4. Correr `./scripts/restore-db.sh <backup>`.
5. `docker compose exec db psql -U $DB_USER -d $DB_NAME -c '\dt'` — verificar tablas.
6. Correr una query sanity: `SELECT count(*) FROM users;` — debería matchear con producción.

**Archivos tocados item #1:**
- `scripts/backup-db.sh` (commit, ya escrito).
- `scripts/restore-db.sh` (commit, ya escrito).
- `.gitignore` (verificar que `data/backups/` está ignorado; añadir si no).
- `docs/DEPLOYMENT.md` (sección nueva "Backups" ~50 líneas).

---

## 2. Log rotation en `docker-compose.prod.yml`

### Estado actual verificado
- `docker-compose.prod.yml` lee completo (69 líneas). **Cero** configuración de `logging:` en los 4 servicios (db, backend, frontend, gateway).
- Default de Docker: driver `json-file` sin límite → `/var/lib/docker/containers/*/*-json.log` crece sin tope.
- Riesgo real: una request burst o un loop de errores (ej. un panic repetido del backend) puede llenar 20-50 GB en horas. El VPS se queda sin disco y el compose entero muere.

### Sub-plan 2.1 — Añadir driver json-file con rotación usando YAML anchor
**Decisión de diseño:** anchor YAML compartido vs repetir 4 veces.
- **Por qué anchor**: 4 servicios, misma config → DRY. Si queremos cambiar el tamaño o el driver más adelante, un solo lugar.
- **Por qué no centralizar a un log driver externo (syslog, journald, fluentd)**: sobre-ingeniería para el MVP. `json-file` con rotación es suficiente; los logs se leen con `docker compose logs`.

**Edit concreto al inicio de `docker-compose.prod.yml` (antes de `services:`):**
```yaml
x-logging: &default-logging
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "5"
    compress: "true"

services:
  db:
    image: postgres:17-alpine
    restart: always
    logging: *default-logging
    environment:
      ...
```

Aplicar el mismo `logging: *default-logging` a `backend`, `frontend`, `gateway`.

**Cálculo de capacidad:**
- 10 MB × 5 archivos × 4 servicios = **200 MB máximo** en disco para logs.
- Con `compress: true`, los archivos rotados se gzipean → en la práctica ~50-80 MB efectivos.
- Criterio: suficiente para ~1-2 días de logs del backend bajo carga normal, y varias semanas para db/frontend/gateway.

**Edge case:** `compress: true` requiere Docker 20.10+. Verificar con `docker --version` en el VPS (casi seguro es 24+ en hosts recientes, pero anotar como precondición).

### Sub-plan 2.2 — Aplicar el mismo cambio a `docker-compose.yml` (dev)
**Decisión:** sí, también en dev. Razón: consistencia entre entornos. Si algún día alguien corre `docker compose up` en el VPS sin el `-f prod`, no queremos logs sin rotación. Bajo: 10 min extra.

### Sub-plan 2.3 — Verificación
**Comandos:**
1. `docker compose -f docker-compose.prod.yml up -d --force-recreate`.
2. `docker inspect pp-backend-1 --format '{{json .HostConfig.LogConfig}}'` → debe mostrar `{"Type":"json-file","Config":{"max-size":"10m","max-file":"5","compress":"true"}}`.
3. Repetir para db, frontend, gateway.
4. Generar carga: `for i in {1..1000}; do curl -s https://localhost/healthz > /dev/null; done`.
5. `docker compose logs backend | wc -l` — debe tener output; los archivos en `/var/lib/docker/containers/<id>/` deben rotar al pasar 10 MB.

**Archivos tocados item #2:**
- `docker-compose.prod.yml` (anchor + 4 líneas `logging: *default-logging`).
- `docker-compose.yml` (mismo cambio).

---

## 3. Healthcheck externo (UptimeRobot)

### Estado actual verificado
- Endpoint `GET /healthz` definido en `backend/internal/httpapi/server.go:41`.
- Handler en `server.go:151-153`:
  ```go
  func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
      writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "service": "projectpulse-api"})
  }
  ```
- **Problema**: es estático. Si Postgres cae, `/healthz` sigue devolviendo 200 y UptimeRobot no alerta. Falso positivo garantizado.
- Expuesto en `nginx/prod.conf:110-113` con `access_log off`.
- El service ya tiene acceso a `*sql.DB` vía `s.service.db` (confirmado: `service.go` usa `s.db.QueryRowContext` en decenas de lugares).

### Sub-plan 3.1 — Mejorar el handler para verificar DB
**Pasos:**
1. **Exponer Ping desde el Service**: añadir en `backend/internal/app/service.go` un método
   ```go
   func (s *Service) Ping(ctx context.Context) error {
       return s.db.PingContext(ctx)
   }
   ```
   - Preferir esto a pasar `*sql.DB` al Server — respeta la capa de servicio.
2. **Modificar `handleHealth`** en `server.go`:
   ```go
   func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
       ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
       defer cancel()
       if err := s.service.Ping(ctx); err != nil {
           writeJSON(w, http.StatusServiceUnavailable, map[string]any{
               "status": "degraded",
               "service": "projectpulse-api",
               "db": "down",
           })
           return
       }
       writeJSON(w, http.StatusOK, map[string]any{
           "status": "ok",
           "service": "projectpulse-api",
           "db": "up",
       })
   }
   ```
3. **Timeout de 2s**: corto pero no tan corto como para fallar en un cold start o GC pause. El healthcheck de Docker ya tiene 5s de timeout (`docker-compose.prod.yml:40`) — nuestro 2s queda dentro.
4. **Status code**: 503 en falla es lo que UptimeRobot espera para alertar.

### Sub-plan 3.2 — No alterar nginx (sigue público)
- `prod.conf:110-113` se queda igual. Cloudflare no cachea `/healthz` (por defecto solo cachea estáticos).
- **Considerar** añadir un header anti-cache explícito en el handler: `w.Header().Set("Cache-Control", "no-store")`. Barato, previene que algún proxy intermedio cachee un 503 y mantenga alertas falsas.

### Sub-plan 3.3 — Documentar setup de UptimeRobot en `docs/DEPLOYMENT.md`
**Nueva sección "External Monitoring":**
1. **Cuenta**: crear free tier en uptimerobot.com (50 monitores, 5 min interval — suficiente).
2. **Monitor config:**
   - Tipo: HTTP(s).
   - URL: `https://<dominio>/healthz`.
   - Interval: 5 min (free tier mínimo).
   - Método: GET.
   - **Keyword monitoring**: activar, esperar `"status":"ok"` — detecta el caso donde el backend responde 200 pero con `status:degraded` (no debería pasar con nuestra lógica, pero doble safety).
3. **Alert contacts**: email del owner + (opcional) webhook a Telegram/Discord/Slack.
4. **Maintenance windows**: documentar cómo pausar el monitor antes de un deploy grande para no alertar por falsos positivos.
5. **Status page pública** (opcional, free tier incluye 1 status page): útil para investor demo — "mira, 99.9% uptime".

### Sub-plan 3.4 — Edge cases considerados
- **Rate limit desde UptimeRobot**: 5 min × 2 regiones = 24 hits/hora. Irrelevante frente a la zone `auth_zone` (que es solo para `/api/v1/auth/`), y `/healthz` no está en ninguna zone.
- **Healthcheck en cascada con Docker**: si el backend tarda 30s en arrancar, Docker compose ya tiene `start_period: 20s` (línea 42). Subir a 30s si tras la mejora vemos flakes en el primer start. No cambiar preventivamente.
- **DB Ping falso-positivo**: `PingContext` hace una conexión nueva si el pool está vacío, pero no garantiza que una query real funcione. Para un healthcheck es suficiente; añadir una query real (`SELECT 1`) sería sobre-ingeniería.
- **DB degraded pero backend funcional**: si el pool tiene conexiones stale, el ping puede fallar pero las queries reales funcionar. Acepto el falso positivo — UptimeRobot reintenta antes de alertar.

**Archivos tocados item #3:**
- `backend/internal/app/service.go` (método `Ping`).
- `backend/internal/httpapi/server.go` (handleHealth nuevo).
- `docs/DEPLOYMENT.md` (sección "External Monitoring").

---

## 4. Centralizar tabla de planes en un solo archivo de config

### Estado actual verificado — 4 lugares con datos de planes
1. **`backend/internal/billing/plans.go`** (103 líneas):
   - `Plan` constantes (starter, professional, business, enterprise).
   - `PlanLimits` map con MaxActiveProjects, MaxInternalUsers, MaxClientGuests, MaxCapturesPerMonth, MaxStorageBytes, MaxBlueprintFiles.
   - `PlanFeatures` map con feature flags (dashboard, timeline, captures, review, messages, blueprints_view/upload, gallery_advanced, quality_score, exports, integrations, api_access, custom_fields, audit_log, sso_saml, white_label, priority_support).
   - **Ya es single source para límites y features**.
2. **`backend/internal/app/billing_service.go:38-43`**: `stripePriceMap()` mapea Plan → Stripe price ID desde config (env vars).
3. **`frontend/components/upgrade-modal.tsx:17-43`**: array `PLANS` hardcoded con `{id, name, price, tagline, highlights}` en **español**.
4. **`frontend/components/landing-seo.tsx:30-35`**: array `plans` hardcoded con `{name, price, blurb}` en **inglés**.

### Decisión del usuario: **mínimo viable**
- No endpoint público nuevo, no refactor a API-driven.
- Un único archivo TS en el frontend como single source para la UI.
- Los límites/features del backend se quedan donde están (ya centralizados).
- Los precios (strings "$49/mes", "$149 USD/mes", "Custom") viven en el frontend — no tiene sentido meterlos al backend Go solo para exportarlos.

### Sub-plan 4.1 — Crear `frontend/lib/plans.ts`
**Nuevo archivo con:**
```ts
// SINGLE SOURCE OF TRUTH for plan display data in the frontend.
// Keep in sync with backend/internal/billing/plans.go (PlanLimits, PlanFeatures).
// Backend is authoritative for enforcement; this file is for UI copy only.

export type PlanId = "starter" | "professional" | "business" | "enterprise";

export interface PlanCopy {
  id: PlanId;
  name: string;
  priceDisplay: { es: string; en: string };
  tagline: { es: string; en: string };
  highlights: { es: string[]; en: string[] };
  blurb: { es: string; en: string }; // short one-liner for landing/SEO
  ctaLabel: { es: string; en: string };
}

export const PLANS: PlanCopy[] = [
  {
    id: "starter",
    name: "Starter",
    priceDisplay: { es: "Prueba 14 días", en: "14-day free trial" },
    tagline: { es: "Prueba guiada para equipos pequeños", en: "Guided trial for small teams" },
    highlights: {
      es: ["1 proyecto activo", "3 usuarios internos", "5 invitados cliente", "50 capturas/mes", "1 GB storage"],
      en: ["1 active project", "3 internal users", "5 client guests", "50 captures/month", "1 GB storage"],
    },
    blurb: { es: "Empieza gratis por 14 días.", en: "Start free for 14 days." },
    ctaLabel: { es: "Empezar prueba", en: "Start trial" },
  },
  {
    id: "professional",
    name: "Professional",
    priceDisplay: { es: "$49 USD/mes", en: "$49 USD/mo" },
    tagline: { es: "Para PYMES con 1–5 proyectos simultáneos", en: "For SMBs running 1-5 concurrent projects" },
    highlights: {
      es: ["5 proyectos activos", "15 usuarios internos", "25 invitados cliente", "500 capturas/mes", "10 GB storage", "Integraciones básicas"],
      en: ["5 active projects", "15 internal users", "25 client guests", "500 captures/month", "10 GB storage", "Basic integrations"],
    },
    blurb: { es: "Equipos con múltiples proyectos activos.", en: "Teams running multiple active projects." },
    ctaLabel: { es: "Elegir Professional", en: "Choose Professional" },
  },
  {
    id: "business",
    name: "Business",
    priceDisplay: { es: "$149 USD/mes", en: "$149 USD/mo" },
    tagline: { es: "Para empresas medianas con múltiples proyectos", en: "For mid-size companies with multiple projects" },
    highlights: {
      es: ["20 proyectos activos", "50 usuarios internos", "100 invitados cliente", "2000 capturas/mes", "50 GB storage", "API access", "Audit log"],
      en: ["20 active projects", "50 internal users", "100 client guests", "2000 captures/month", "50 GB storage", "API access", "Audit log"],
    },
    blurb: { es: "Escala con controles y auditoría.", en: "Scale with controls and audit." },
    ctaLabel: { es: "Elegir Business", en: "Choose Business" },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceDisplay: { es: "Custom", en: "Custom" },
    tagline: { es: "Sin límites, SSO, white-label y soporte prioritario", en: "No limits, SSO, white-label, priority support" },
    highlights: {
      es: ["Proyectos ilimitados", "Usuarios ilimitados", "SSO SAML", "White-label", "Soporte prioritario"],
      en: ["Unlimited projects", "Unlimited users", "SSO SAML", "White-label", "Priority support"],
    },
    blurb: { es: "Para organizaciones con necesidades a la medida.", en: "For organizations with custom needs." },
    ctaLabel: { es: "Contactar ventas", en: "Contact sales" },
  },
];

export function planById(id: PlanId): PlanCopy | undefined {
  return PLANS.find((p) => p.id === id);
}
```

**Comentario header clave:** explicar que este archivo debe mantenerse en sync con `plans.go` — si cambiás un límite ahí, aquí hay que reflejar el string nuevo.

### Sub-plan 4.2 — Refactor de `upgrade-modal.tsx`
- Eliminar el `const PLANS` local (líneas 17-43).
- `import { PLANS, PlanCopy } from "@/lib/plans";`.
- El componente actualmente es en español → usar `PLANS.map(p => p.highlights.es)` provisionalmente.
- **Cruce con item #5 (i18n):** cuando se implemente next-intl, reemplazar `.es` por `[locale]`. Dejarlo señalizado con un comentario `// TODO(i18n): use current locale`.

### Sub-plan 4.3 — Refactor de `landing-seo.tsx`
- Eliminar el array local.
- Importar `PLANS`.
- Mapear a la estructura que espera el JSON-LD de SEO (`{name, price, blurb}`).
- Misma nota de i18n.

### Sub-plan 4.4 — Comentario de sincronización en `plans.go`
Añadir al top de `backend/internal/billing/plans.go`:
```go
// Limits and features are enforced here (authoritative).
// Display copy (pricing labels, taglines, highlights) lives in
// frontend/lib/plans.ts — keep in sync when changing limits/tiers.
```

### Sub-plan 4.5 — Edge cases y riesgos
- **Riesgo de desincronización**: es real. Mitigación: el comentario en ambos archivos + una nota en `docs/DEPLOYMENT.md` ("Changing a plan tier requires edits in both plans.go and frontend/lib/plans.ts").
- **Upgrade futuro**: si en algún momento se quiere mover a un catálogo servido por API, la estructura de `frontend/lib/plans.ts` ya matchea 1:1 lo que sería un `GET /api/v1/public/plans`, así que el refactor será mecánico.

**Archivos tocados item #4:**
- `frontend/lib/plans.ts` (nuevo, ~70 líneas).
- `frontend/components/upgrade-modal.tsx` (reemplazar array local).
- `frontend/components/landing-seo.tsx` (reemplazar array local).
- `backend/internal/billing/plans.go` (comentario al top).
- `docs/DEPLOYMENT.md` (nota sobre sync manual).

---

## 5. i18n / bilingüe completo (es / en)

### Estado actual verificado
- **Ningún framework i18n instalado**. `package.json` no tiene `next-intl`, `react-i18next`, `lingui`, `next-translate`.
- **Mezcla actual**: HTML `lang="en"`, metadata/OG en inglés, landing en inglés, pero la SPA (control-center, owner-canvas, public-workspace, upgrade-modal, usage-panel) está en español con formateo `es-MX`. Algunos componentes secundarios tienen formateo `en-US` (evidence-gallery, budget-panel, task-approval-modal).
- **Volumen**:
  - `control-center.tsx`: 1653 líneas.
  - `owner-canvas.tsx`: 444 líneas.
  - `public-workspace.tsx`: 372 líneas.
  - `upgrade-modal.tsx`: 314 líneas.
  - `landing-seo.tsx`: 118 líneas.
  - `usage-panel.tsx`: 95 líneas.
  - **+30 componentes más** en `frontend/components/*.tsx`.
  - Total ~3000-5000 líneas relevantes.

### Decisión del usuario: **scope completo (fases 1+2+3)**

### Sub-plan 5.1 — Elegir librería: `next-intl`
**Por qué next-intl y no alternativas:**
- **next-intl**: diseñado para Next.js 15 App Router, soporta Server Components (necesario para `landing-seo.tsx` que debe renderizar en SSR para SEO), tipado, pequeño bundle.
- **react-i18next**: pensado para pure CRA/Vite, integración con App Router más torpe.
- **next-translate**: menos mantenido, soporte para App Router limitado.
- **lingui**: excelente pero más pesado para setup, y tiene su propio sistema de extracción via CLI que requiere tooling adicional.

**Veredicto**: next-intl. Es lo que el ecosistema Next.js 15 espera.

### Sub-plan 5.2 — Modo de i18n: sin routing (cookie-based)
**Decisión:** modo "without i18n routing" — el idioma se persiste en cookie `pp-locale`, no en URL.

**Por qué:**
- **A favor**: la SPA actual vive en `/` — no hay `/es/...` vs `/en/...`. Simpler. No rompe URLs existentes. El selector de idioma es instantáneo via `router.refresh()`.
- **En contra**: SEO bilingüe es más débil (Google prefiere URLs diferenciadas para hreflang). Pero para un MVP de investor demo, el SEO en dos idiomas no es la prioridad — la prioridad es que el investor pueda togglear el idioma en vivo.
- **Trade-off aceptado**: si más adelante se quiere SEO serio, migrar a modo con routing (`/es` / `/en`) es mecánico: next-intl lo soporta nativo.

### Sub-plan 5.3 — Setup técnico
**Pasos (orden estricto):**
1. **Añadir dep a `frontend/package.json`**: `"next-intl": "^3.x"` en dependencies. Rebuild container.
2. **Crear `frontend/i18n.ts`** — config central:
   ```ts
   import { getRequestConfig } from "next-intl/server";
   import { cookies } from "next/headers";
   export default getRequestConfig(async () => {
     const locale = (await cookies()).get("pp-locale")?.value || "es";
     return { locale, messages: (await import(`./messages/${locale}.json`)).default };
   });
   ```
3. **Crear `frontend/messages/es.json` y `frontend/messages/en.json`** — vacíos al principio, se llenan por fase.
4. **Modificar `frontend/next.config.ts`** para incluir el plugin `createNextIntlPlugin('./i18n.ts')`.
5. **Modificar `frontend/app/layout.tsx`**:
   - Envolver children en `<NextIntlClientProvider messages={messages}>`.
   - Reemplazar `<html lang="en">` por `<html lang={locale}>` (leído del request).
   - Mover metadata a función `generateMetadata()` que use `getTranslations()` para devolver title/description traducidos.
6. **Crear `frontend/components/locale-switcher.tsx`**:
   ```tsx
   "use client";
   import { useRouter } from "next/navigation";
   export function LocaleSwitcher({ current }: { current: string }) {
     const router = useRouter();
     const toggle = () => {
       const next = current === "es" ? "en" : "es";
       document.cookie = `pp-locale=${next}; path=/; max-age=31536000`;
       router.refresh();
     };
     return <button onClick={toggle}>{current === "es" ? "EN" : "ES"}</button>;
   }
   ```
7. **Insertar `<LocaleSwitcher />`** en el topbar — probablemente `frontend/components/topbar.tsx` o en el header de `control-center.tsx`.

### Sub-plan 5.4 — Plan de extracción por fases
**Estrategia:** no tratar de hacerlo todo en un commit. Tres fases, cada una su PR.

#### Fase 5.4.a — Metadata + landing + billing UI (la más visible)
**Archivos:**
- `app/layout.tsx` (metadata, OG, twitter cards).
- `components/landing-seo.tsx` (118 líneas).
- `components/upgrade-modal.tsx` (314 líneas).
- `components/usage-panel.tsx` (95 líneas).
- `components/trial-banner.tsx`.
- `components/paywall-overlay.tsx`.

**Namespaces en JSON:**
```json
{
  "Landing": { "heroTitle": "...", "heroSubtitle": "...", "ctaPrimary": "..." },
  "Upgrade": { "modalTitle": "Upgrade tu plan", "close": "...", ... },
  "Usage": { "planUsage": "Uso del plan", "activeProjects": "Proyectos activos", ... },
  "Billing": { "trialBanner": "...", "paywallTitle": "..." }
}
```

**Estimado**: 4-5 horas. Es donde hay más texto denso por línea.

#### Fase 5.4.b — SPA principal
**Archivos (por tamaño descendente):**
- `control-center.tsx` (1653 líneas — el monstruo).
- `owner-canvas.tsx` (444).
- `public-workspace.tsx` (372).
- `supervisor-canvas.tsx`, `helper-canvas.tsx`, `client-canvas.tsx`, `admin-canvas.tsx`.

**Estrategia para control-center.tsx**:
- Primero grep por `>([A-Z][a-zá-ú][^<]{3,})<` para encontrar strings JSX.
- También buscar `placeholder=`, `aria-label=`, `title=`.
- También strings en condicionales (`{condition ? "Sí" : "No"}`).
- Por volumen, hacer sub-commits por sección (login flow, dashboard, gantt, etc.) para que el diff sea revisable.

**Namespaces:**
```json
{
  "Auth": { "login": "...", "register": "...", "forgotPassword": "..." },
  "Dashboard": { ... },
  "Gantt": { ... },
  "Owner": { ... },
  "Public": { ... },
  "Common": { "save": "...", "cancel": "...", "delete": "...", "loading": "..." }
}
```

**Estimado**: 6-8 horas. El control-center es el bottleneck.

#### Fase 5.4.c — Componentes secundarios, modales, toasts
**Archivos:**
- `task-edit-modal.tsx`, `task-approval-modal.tsx`, `photo-upload-modal.tsx`, `settings-general-modal.tsx`, `settings-project-modal.tsx`.
- `daily-journal.tsx`, `dashboard.tsx`, `financial-control.tsx`, `budget-panel.tsx`.
- `evidence-gallery.tsx`, `captures-canvas.tsx`, `gantt-timeline.tsx`, `blueprint-3d.tsx`, `cad-viewer.tsx`, `plan-viewer.tsx`.
- `messaging-hub.tsx`, `right-inspector.tsx`, `sidebar.tsx`, `topbar.tsx`, `mobile-bottom-nav.tsx`, `mobile-hamburger-menu.tsx`.
- **Sonner toasts**: grep `toast(` — todos los strings de notificación.
- **Error messages**: `catch` blocks que muestran texto al usuario.

**Estimado**: 3-4 horas.

### Sub-plan 5.5 — Unificar formateo de números/fechas
**Estado actual**: mezclado. `toLocaleString("es-MX")` y `toLocaleString("en-US")` hardcoded en ~6 componentes.

**Cambio:** usar `useFormatter()` de next-intl.
```tsx
import { useFormatter } from "next-intl";
const format = useFormatter();
format.number(value, { style: "currency", currency: "USD" });
format.dateTime(date, { dateStyle: "medium" });
```

**Grep objetivo:** `toLocaleString`, `toLocaleDateString`, `Intl.NumberFormat`, `Intl.DateTimeFormat` en todo `frontend/`. Estimado: 10-20 call sites.

### Sub-plan 5.6 — Backend: mensajes de error traducibles
**Problema:** el backend devuelve errores en texto (`"email ya registrado"`, `"invalid credentials"`). Si el frontend traduce solo la UI, estos mensajes aparecen en un idioma fijo.

**Decisión:** **no traducir desde el backend**. Backend devuelve **codes**, frontend traduce.

**Patrón:**
- Backend devuelve `{error: {code: "EMAIL_ALREADY_REGISTERED", message: "email ya registrado"}}`.
- Frontend muestra `t(\`errors.${code}\`)` con fallback a `message` si el code no está traducido.
- **Scope mínimo para esta ronda**: grep en backend por `writeError(` y `errors.New("`, catalogar los códigos más usados, traducirlos. No hace falta refactor completo — basta con añadir `code` a los errores más visibles (auth, billing).

**Archivos backend potencialmente tocados:**
- `backend/internal/app/auth.go`, `service.go`, `billing_service.go` — añadir codes a los errores user-facing.
- `backend/internal/httpapi/server.go` — `writeError` debe serializar `{code, message}`.

**Estimado backend**: 2 horas.

### Sub-plan 5.7 — Selector de idioma: UX
**Dónde vive:** topbar, arriba a la derecha, junto al avatar del usuario.
**Comportamiento:**
- Botón `ES | EN` con el idioma activo resaltado.
- Click → cambia cookie → `router.refresh()` → toda la UI re-renderiza.
- Detección inicial: cookie existente > `Accept-Language` del navegador > fallback a `es`.
- Persistencia: cookie de 1 año.

**Edge case:** usuarios no autenticados (landing page) → el switcher debe estar también en la landing, arriba. Añadir al hero de `landing-seo.tsx`.

### Sub-plan 5.8 — QA checklist
- [ ] Togglear idioma en login screen — metadata y título cambian.
- [ ] Togglear en upgrade modal — todos los highlights cambian.
- [ ] Togglear en control-center owner view — sidebar, topbar, dashboard, gantt todos cambian.
- [ ] Togglear en public-workspace (demo mode) — toda la vista cliente cambia.
- [ ] Recargar página → idioma persiste.
- [ ] Abrir ventana incógnito → default es `es`.
- [ ] `curl -H 'Accept-Language: en-US' https://localhost/` → HTML tiene `lang="en"`.
- [ ] Formato de números en owner-canvas respeta locale (separador de miles coma vs punto).
- [ ] Formato de fechas respeta locale (MM/DD/YYYY en inglés, DD/MM/YYYY en español).
- [ ] Ningún string hardcoded visible al usuario quedó sin traducir — grep final por patrones sospechosos (`[^t]\("[A-Z]`).

### Sub-plan 5.9 — Estrategia de no-romper-el-demo
**Problema:** tocar ~3000 líneas de TSX en una sola sesión es riesgoso.
**Mitigación:**
- Cada fase es un commit separado que pasa `npm run build` antes de seguir.
- Empezar por fase 5.4.a (la más importante para el demo) → si el tiempo aprieta, el investor ve landing + upgrade + usage en ambos idiomas y el resto queda en español nativo (coherente).
- Fase 5.4.c puede quedar pendiente — es aceptable si tooltips secundarios siguen solo en español al principio.

**Archivos tocados item #5:**
- `frontend/package.json` (+ next-intl).
- `frontend/i18n.ts` (nuevo).
- `frontend/next.config.ts` (plugin).
- `frontend/messages/es.json` (nuevo).
- `frontend/messages/en.json` (nuevo).
- `frontend/app/layout.tsx`.
- `frontend/components/locale-switcher.tsx` (nuevo).
- `frontend/components/topbar.tsx` (insertar switcher).
- ~30 componentes de `frontend/components/*.tsx` (extracción de strings por fase).
- Backend: `auth.go`, `service.go`, `billing_service.go`, `server.go` (error codes).

---

## 6. Rate limiting real-IP en nginx (detrás de Cloudflare)

### Estado actual verificado
- `nginx/prod.conf:8`: `limit_req_zone $binary_remote_addr zone=auth_zone:10m rate=10r/m;`
- Aplicado a `/api/v1/auth/` en líneas 68-78 con `burst=20 nodelay`.
- **Problema confirmado**: `$binary_remote_addr` es la IP del cliente inmediato. Con Cloudflare delante, **esa IP es de Cloudflare**, no del usuario → toda la zone se llena con 1 IP (la de Cloudflare) y la rate limiter es inútil (o peor, rate-limitea a todos los usuarios legítimos de golpe cuando Cloudflare excede 10r/m en total).
- `X-Forwarded-For` y `X-Real-IP` se envían al backend (`prod.conf:72, 73, 85`), pero nginx mismo no usa esos headers para la rate limiter.
- Módulo `ngx_http_realip_module`: está compilado en `nginx:1.27-alpine` (built-in). No hace falta cambiar la imagen.
- Backend tiene su propia rate limiter en memoria (`backend/internal/httpapi/middleware.go`) — eso funciona con la IP que recibe vía `X-Real-IP`. Eso sí está bien, pero duplicar esfuerzo en nginx es la primera línea de defensa.

### Decisión del usuario: **Cloudflare delante**

### Sub-plan 6.1 — Añadir bloque realip con rangos de Cloudflare
**Dónde:** dentro del `server { listen 443 ssl; ... }` (porque `conf.d/default.conf` se monta en ese scope, no al nivel `http`).

**Edit en `nginx/prod.conf`** después de la línea 54 (`client_max_body_size 500M;`) y antes de los `add_header`:
```nginx
# --- Cloudflare real-IP ---
# Trust only Cloudflare edges to set the client IP via CF-Connecting-IP.
# List from https://www.cloudflare.com/ips-v4 and ips-v6 (as of 2026-04-13).
# Regenerate periodically: scripts/refresh-cloudflare-ips.sh
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2a06:98c0::/29;
set_real_ip_from 2c0f:f248::/32;

real_ip_header CF-Connecting-IP;
real_ip_recursive on;
# --- end Cloudflare real-IP ---
```

**Explicación línea por línea:**
- `set_real_ip_from <cidr>`: "confía en estos peers para enviarte IP del cliente". Si la request viene de esos rangos, nginx lee el header.
- `real_ip_header CF-Connecting-IP`: el header que Cloudflare envía con la IP real del cliente (más confiable que `X-Forwarded-For`, que puede tener múltiples valores).
- `real_ip_recursive on`: si hay múltiples proxies en cadena, recorre el XFF hasta encontrar el primer peer no confiable.

**Efecto:** después de esta directiva, `$remote_addr` y `$binary_remote_addr` reflejan la IP real del usuario final, no la de Cloudflare.

### Sub-plan 6.2 — `limit_req_zone` se queda igual
**No cambiar** `$binary_remote_addr`. El punto de `set_real_ip_from` es que justamente esa variable ahora contiene la IP correcta. Cambiar a `$http_x_forwarded_for` sería un anti-patrón (ese header puede ser falsificado si no confiás en el peer; confiamos en el peer via `set_real_ip_from`).

### Sub-plan 6.3 — Ajustar `X-Real-IP` al backend
**Verificar:** después del realip, `$remote_addr` ya es la IP del cliente. Las líneas `proxy_set_header X-Real-IP $remote_addr;` (72, 84, 99, 119) ahora envían la IP correcta al backend → el rate limiter interno del backend (`middleware.go`) también se beneficia automáticamente.

**No hay edit necesario**, pero sí verificar que la cadena termina siendo: cliente → CF → nginx (descifra real IP) → backend (recibe XFF con IP real).

### Sub-plan 6.4 — Script de refresh de rangos de Cloudflare
**Archivo nuevo**: `scripts/refresh-cloudflare-ips.sh`:
```bash
#!/usr/bin/env bash
# Regenerate the Cloudflare real-IP block in nginx/prod.conf.
# Run when you want to pick up new edge IPs.
set -euo pipefail
v4=$(curl -fsSL https://www.cloudflare.com/ips-v4)
v6=$(curl -fsSL https://www.cloudflare.com/ips-v6)
{
  echo "# --- Cloudflare real-IP ---"
  echo "# Regenerated $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  while IFS= read -r cidr; do echo "set_real_ip_from ${cidr};"; done <<< "$v4"
  while IFS= read -r cidr; do echo "set_real_ip_from ${cidr};"; done <<< "$v6"
  echo "real_ip_header CF-Connecting-IP;"
  echo "real_ip_recursive on;"
  echo "# --- end Cloudflare real-IP ---"
} > /tmp/cf-realip-block.conf
echo "Generated /tmp/cf-realip-block.conf — copy into nginx/prod.conf manually."
```
- **Por qué manual y no in-place edit**: evitar tocar prod.conf con un script que podría corromperlo. Mejor generar el bloque y copiarlo a mano — bajo frecuencia (los rangos de CF cambian raramente).

### Sub-plan 6.5 — Documentación en `docs/DEPLOYMENT.md`
**Sección nueva "Rate limiting / real-IP":**
1. Explicar que nginx confía en Cloudflare via `set_real_ip_from`.
2. Cómo regenerar los rangos: `./scripts/refresh-cloudflare-ips.sh`.
3. Cómo verificar que funciona: `docker compose logs gateway | grep limiting` — debería mostrar la IP real del cliente, no `172.x.x.x` (Cloudflare).
4. **Warning importante**: si alguna vez se quita Cloudflare del delante y nginx pasa a ser edge directo, **hay que borrar el bloque `set_real_ip_from`** o seguirá leyendo `CF-Connecting-IP` (que no existe) y rompería el rate limiter. Documentar esto claramente.

### Sub-plan 6.6 — Edge cases y riesgos
- **Bypass del rate limiter**: un atacante que conozca la IP directa del VPS (`dig +short <vps>.hostname`) podría saltarse Cloudflare y hitear nginx directo. Mitigación fuera del scope de este plan: firewall del VPS (ufw/iptables) que solo acepte tráfico del rango de Cloudflare en el puerto 443.
- **Dev local**: en `docker-compose.yml` (dev) el gateway recibe tráfico directo desde el browser. El bloque `set_real_ip_from` **no debe estar en `nginx/default.conf`** (solo en `prod.conf`). Ya verificado: solo tocamos `prod.conf`.
- **Falso-positivo de rate limit**: con la IP real, el rate limit pasa a ser efectivo por usuario real. El valor actual (10r/m) puede ser muy agresivo para usuarios que hagan login y retry rápidamente. Monitorear los logs los primeros días post-deploy y subir a `20r/m` si hay quejas.
- **IPv6**: incluido en el bloque (2400:cb00::/32 etc.). Cloudflare tiene soporte IPv6 y hay que cubrirlo.

### Sub-plan 6.7 — Verificación end-to-end
1. Deploy con nginx nuevo: `docker compose -f docker-compose.prod.yml up -d gateway`.
2. `docker compose exec gateway nginx -t` — valida sintaxis.
3. Hacer una request normal: `curl -v https://<domain>/healthz` → 200.
4. En los logs del backend: `docker compose logs backend | tail -20 | grep X-Real-IP` — debe mostrar tu IP pública real (no un 172.x.x.x interno de docker ni un IP de Cloudflare).
5. **Test del rate limit**: desde dos IPs distintas (tu laptop + móvil con datos), hacer 15 `POST /api/v1/auth/login` en menos de 1 min.
   - Cada IP debe contar por separado → una no debería afectar a la otra.
   - Pre-fix: ambas se cortan porque cuentan como "Cloudflare IP".
   - Post-fix: solo la que excede su propia quota es bloqueada.
6. `docker compose logs gateway 2>&1 | grep 'limiting requests'` — los logs deben mostrar la IP del cliente en vez de `172.x.x.x`.

**Archivos tocados item #6:**
- `nginx/prod.conf` (bloque realip + comentarios).
- `scripts/refresh-cloudflare-ips.sh` (nuevo).
- `docs/DEPLOYMENT.md` (sección rate limiting).

---

## Orden de ejecución y agrupación en PRs

### PR 1 — "infra: log rotation + healthcheck + real-IP" (~2h)
- Item #2 (log rotation): 15 min.
- Item #3 (healthcheck con DB ping + UptimeRobot docs): 45 min.
- Item #6 (real-IP nginx + script + docs): 45 min.
- Bajo riesgo, cambios localizados, deploy directo.

### PR 2 — "ops: postgres backups" (~30 min)
- Item #1 (commit scripts + documentación del cron): 30 min.
- Fuera de PR 1 porque los scripts son untracked y merecen su propio commit limpio.

### PR 3 — "frontend: centralize plans catalog" (~1h)
- Item #4 (`lib/plans.ts` + refactor upgrade-modal + landing-seo): 1 hora.
- Se puede hacer antes o después de i18n; no bloquea.

### PR 4-6 — "i18n: phase 1/2/3" (~15h total, en varios PRs)
- PR 4: setup next-intl + fase 5.4.a (metadata, landing, upgrade, usage).
- PR 5: fase 5.4.b (control-center, owner-canvas, public-workspace).
- PR 6: fase 5.4.c (modales, toasts, secundarios) + backend error codes.
- **Se puede cortar después del PR 4** si el investor demo ya se ve bilingüe en lo crítico — el resto queda como deuda técnica aceptable.

---

## Verificación end-to-end global

### Smoke test completo post-deploy
```bash
# 1. Healthcheck
curl -fs https://<domain>/healthz | jq '.status'  # → "ok"
docker compose -f docker-compose.prod.yml stop db
sleep 3
curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/healthz  # → 503
docker compose -f docker-compose.prod.yml start db

# 2. Log rotation
docker inspect pp-backend-1 --format '{{.HostConfig.LogConfig.Config}}'
# → map[max-file:5 max-size:10m compress:true]

# 3. Real-IP
curl https://<domain>/healthz
docker compose logs gateway --tail 5 | grep 'GET /healthz'
# → debe mostrar TU IP pública, no 172.x.x.x

# 4. Rate limit
for i in {1..15}; do curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<domain>/api/v1/auth/login -d '{}'; done
# → primeros 10-20 pasan, luego 503 (nginx rate limit)

# 5. Backup
./scripts/backup-db.sh
ls -lh /srv/pp-backups/ | tail -1
zcat /srv/pp-backups/pp-*.sql.gz | head -5  # → PostgreSQL dump header

# 6. Restore drill (staging only)
./scripts/restore-db.sh /srv/pp-backups/pp-<stamp>.sql.gz

# 7. Planes sync
grep -c 'priceDisplay' frontend/lib/plans.ts  # → 4
grep -c 'Plan = ' backend/internal/billing/plans.go  # → 4

# 8. i18n
curl -H 'Cookie: pp-locale=en' https://<domain>/ | grep -o 'lang="en"'
curl -H 'Cookie: pp-locale=es' https://<domain>/ | grep -o 'lang="es"'

# 9. Backend tests
cd backend && go test ./...
```

### Rollback plan por item
- **#1 backups**: revertir commit, eliminar cron del host. Zero impacto en runtime.
- **#2 log rotation**: revertir commit, `docker compose up -d --force-recreate`. Vuelve al default sin rotación.
- **#3 healthcheck**: revertir el handler a la versión estática. UptimeRobot sigue funcionando con el endpoint más tonto.
- **#4 plans**: revertir el import en upgrade-modal/landing-seo, borrar `lib/plans.ts`.
- **#5 i18n**: cada fase en su PR → revertir el PR problemático, los anteriores quedan.
- **#6 nginx**: revertir el bloque realip. El rate limiter vuelve a ser decorativo pero nada se rompe.

---

## Archivos críticos tocados — resumen

| Archivo | Items |
|---|---|
| `docker-compose.prod.yml` | #2 |
| `docker-compose.yml` | #2 |
| `nginx/prod.conf` | #6 |
| `scripts/backup-db.sh` | #1 (commit) |
| `scripts/restore-db.sh` | #1 (commit) |
| `scripts/refresh-cloudflare-ips.sh` | #6 (nuevo) |
| `backend/internal/httpapi/server.go` | #3 |
| `backend/internal/app/service.go` | #3 (método Ping) |
| `backend/internal/billing/plans.go` | #4 (comentario) |
| `backend/internal/app/auth.go` | #5 (error codes) |
| `backend/internal/app/billing_service.go` | #5 (error codes) |
| `frontend/package.json` | #5 (next-intl dep) |
| `frontend/i18n.ts` | #5 (nuevo) |
| `frontend/next.config.ts` | #5 |
| `frontend/app/layout.tsx` | #5 |
| `frontend/messages/es.json` | #5 (nuevo) |
| `frontend/messages/en.json` | #5 (nuevo) |
| `frontend/lib/plans.ts` | #4 (nuevo) |
| `frontend/components/locale-switcher.tsx` | #5 (nuevo) |
| `frontend/components/upgrade-modal.tsx` | #4, #5 |
| `frontend/components/landing-seo.tsx` | #4, #5 |
| `frontend/components/usage-panel.tsx` | #5 |
| `frontend/components/control-center.tsx` | #5 |
| `frontend/components/owner-canvas.tsx` | #5 |
| `frontend/components/public-workspace.tsx` | #5 |
| `frontend/components/topbar.tsx` | #5 |
| `frontend/components/*.tsx` (~25 más) | #5 |
| `docs/DEPLOYMENT.md` | #1, #3, #4, #6 |

---

## Riesgos globales identificados

1. **Scope creep en i18n**: ~3000-5000 líneas de TSX a revisar. Mitigación: fases, cada una PR revisable.
2. **Desincronización plans.go ↔ lib/plans.ts**: riesgo humano. Mitigación: comentarios en ambos + nota en docs. Aceptable para MVP.
3. **Cloudflare rangos cambian**: raro pero real. Mitigación: script de refresh + nota en docs para correrlo trimestralmente.
4. **Backup drill nunca ejecutado**: riesgo más grande de todos. Mitigación: bloquear el plan como "no terminado" hasta que se haya hecho al menos un restore drill en staging. Documentar en el docs como checkpoint obligatorio.
5. **Rate limit demasiado agresivo tras fix de real-IP**: ahora que funciona por usuario real, 10r/m puede ser muy bajo. Mitigación: monitorear logs 48h post-deploy, subir a 20r/m si hay falsos positivos.
