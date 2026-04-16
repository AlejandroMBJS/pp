# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ProjectPulse** is a full-stack production SaaS for technical project management and quality control. Multi-tenant with role-based access control. Real companies are using it — treat all changes as production-critical.

**Production URL**: `https://projpul.com` (Cloudflare CDN → VPS nginx on port 8888)

## Golden Rules

1. **Never delete the database or run destructive migrations** — real companies are registered
2. **Edit local → rsync to VPS → rebuild**. Never edit VPS directly.
3. **Always hard-refresh (Ctrl+Shift+R)** after deploy to verify changes
4. **The frontend is dark-themed (glass morphism)** — never use light-mode Tailwind classes (`bg-gray-50`, `bg-white`, `text-gray-900`) inside modals or app components. Use `bg-white/5`, `hover:bg-white/10`, `text-white`, etc.

## Commands

### Run the full stack (local)
```bash
docker compose up --build
```
Exposes the app at `http://localhost:1212` via Nginx.

### Frontend
```bash
cd frontend
npm run dev      # dev server on 0.0.0.0:3000
npm run build    # production build
npm start        # start production server
```

### Backend
```bash
cd backend
go mod download
go build ./cmd/api
go test ./...              # run all tests
go test -run TestName ./.. # run a single test
```

The backend e2e tests are in `backend/e2e_test.go`.

### Deploy to Production (VPS)
```bash
# Get VPS password
VPS_PASS=$(sed -n '3p' ~/maqzone/vps | tr -d '\n\r ')

# Sync specific files to VPS
sshpass -p "$VPS_PASS" rsync -avz /home/amb/pp/frontend/components/ root@72.62.201.134:/root/pp/frontend/components/

# Rebuild frontend only
sshpass -p "$VPS_PASS" ssh root@72.62.201.134 "cd /root/pp && docker compose -f docker-compose.prod.yml --env-file .env up -d --build frontend"

# Rebuild backend only
sshpass -p "$VPS_PASS" ssh root@72.62.201.134 "cd /root/pp && docker compose -f docker-compose.prod.yml --env-file .env up -d --build backend"

# Check logs
sshpass -p "$VPS_PASS" ssh root@72.62.201.134 "docker logs pp-frontend-1 --tail 20"
sshpass -p "$VPS_PASS" ssh root@72.62.201.134 "docker logs pp-backend-1 --tail 20"
```

### Database Operations (CAREFUL — production data)
```bash
# Query the database
sshpass -p "$VPS_PASS" ssh root@72.62.201.134 "docker exec pp-db-1 psql -U arquicheck -d arquicheck -c 'SELECT ...'"

# DB credentials: arquicheck / 5fefd5fbb726380ed2dbd156e4d8b87e / arquicheck
```

## Architecture

### Service Layout (Production)

```
Cloudflare CDN (projpul.com)
  → Nginx (Port 8888:80)
      ├── /api/*      → Backend (Port 8080)
      ├── /uploads/*  → Backend (Port 8080)
      ├── /healthz    → Backend (Port 8080)
      └── /*          → Frontend (Port 3000)
```

Docker containers: `pp-frontend-1`, `pp-backend-1`, `pp-db-1` (postgres), `pp-gateway-1` (nginx)

### Backend (`backend/`)

Layered Go service:

- **`cmd/api/main.go`** — Entry point; reads env vars, initializes DB and starts HTTP server.
- **`internal/httpapi/server.go`** — Chi router, CORS, JWT auth middleware, all HTTP handlers.
- **`internal/app/service.go`** — Business logic: registration, login, project/task/deliverable/evidence management, CSV export, invite flow.
- **`internal/app/store.go`** — PostgreSQL operations; multi-tenant isolation via `tenant_id` on every query.
- **`internal/app/models.go`** — All domain structs.
- **`internal/app/auth.go`** — JWT creation/validation and password hashing.

**Database**: PostgreSQL. 19 tables with `tenant_id` isolation. Key tables: `tenants`, `users`, `projects`, `tasks`, `deliverables`, `evidences`, `subscriptions`, `daily_logs`, `project_messages`, `expenses`, `blueprints`, `notifications`.

**Auth**: JWT (`golang-jwt/jwt v5`). Invite flow: POST `/api/v1/users/invite` → generates token → user visits `/app?invite=TOKEN` → sets password via `/api/v1/auth/setup-account`.

**RBAC**: Roles — `admin`, `owner`, `supervisor`, `helper`, `client`.

### Frontend (`frontend/`)

Next.js 15 + next-intl (locales: es/en, default: es, prefix: as-needed).

**Key files:**
- **`components/control-center.tsx`** (~1800 lines) — Main SPA component. Manages auth, state, view routing. All views render through `renderCanvas()`.
- **`components/owner-canvas.tsx`** — Overview, projects, team views for owner role.
- **`components/sidebar.tsx`** — Left nav with role-based menu items (owner gets 14 items flat, no grouping).
- **`components/topbar.tsx`** — Breadcrumb, CSV export, notifications, user chip, settings gear, logout.
- **`components/fab-actions.tsx`** — Floating action button (bottom-right) with New Project, New Task, Invite User.
- **`components/new-project-modal.tsx`** — Modal for creating projects.
- **`components/invite-user-modal.tsx`** — Modal for inviting team members with role selection + invite link copy.
- **`components/task-edit-modal.tsx`** — Modal for creating/editing tasks with comparison photo upload.
- **`components/settings-general-modal.tsx`** — Company settings, team management, notifications, security/delete.
- **`components/settings-project-modal.tsx`** — Per-project settings.
- **`components/financial-control.tsx`** — Finance view (requires selected project).
- **`components/daily-journal.tsx`** — Daily log (requires selected project).
- **`components/messaging-hub.tsx`** — Messages/RFI (requires selected project).
- **`components/plan-viewer.tsx`** — CAD/3D file viewer.
- **`app/[locale]/app/page.tsx`** — Auth gate. Passes `?invite=` and `?reset=` tokens through to ControlCenter without redirecting to login.

**Important patterns:**
- Views like finances/journal/messages require `currentProject` — show "No project selected" empty state if none chosen.
- Capture/history views require `currentTask` — show "No task selected" if none chosen.
- The custom `Input` component does NOT support HTML `min` attribute — use `Math.max(0, ...)` in onChange instead.
- All modals use dark glass theme (`var(--glass-bg)`) — never use Tailwind light-mode utility classes inside them.

### Environment Variables (Backend - Production)

| Variable | Value | Purpose |
|---|---|---|
| `DB_USER` | `arquicheck` | PostgreSQL user |
| `DB_PASSWORD` | (in .env) | PostgreSQL password |
| `DB_NAME` | `arquicheck` | PostgreSQL database |
| `JWT_SECRET` | (in .env) | Signing key for JWTs |
| `PUBLIC_BASE_URL` | `https://projpul.com` | Base URL for invite links and uploads |
| `UPLOAD_DIR` | `/app/data/uploads` | File upload directory |
| `PLATFORM_ADMIN_EMAIL` | (in .env) | Platform admin account |
| `RESEND_API_KEY` | (in .env) | Email sending via Resend |
| `STRIPE_SECRET_KEY` | (in .env) | Stripe billing |

### Environment Variables (Frontend)

| Variable | Purpose |
|---|---|
| `API_BASE_URL` | Backend URL used during Next.js build (SSR/ISR requests) |
