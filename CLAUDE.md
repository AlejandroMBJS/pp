# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ProjectPulse** is a full-stack MVP for technical project management and quality control (CRM + QA workflows). It is a dockerized demo scaffold for investor presentations with multi-tenant support and role-based access control.

## Commands

### Run the full stack
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

## Architecture

### Service Layout

```
Nginx (Port 1212)
├── /api/*      → Backend (Port 8080)
├── /uploads/*  → Backend (Port 8080)
├── /healthz    → Backend (Port 8080)
└── /*          → Frontend (Port 3000)
```

### Backend (`backend/`)

Layered Go service with three packages:

- **`cmd/api/main.go`** — Entry point; reads env vars via `envOrDefault()`, initializes DB and starts the HTTP server.
- **`internal/httpapi/server.go`** — Chi router, CORS middleware, JWT auth middleware, all HTTP route handlers (auth, projects, tasks, evidence, admin, file uploads).
- **`internal/app/service.go`** — Business logic: registration, login, project/task/deliverable/evidence management, CSV export.
- **`internal/app/store.go`** — PostgreSQL operations via `database/sql` with `lib/pq`; multi-tenant isolation enforced by `tenant_id` on every query.
- **`internal/app/models.go`** — All domain structs: User, Tenant, Project, Task, Deliverable, Evidence, RBAC rules, JWT claims, dashboard types.
- **`internal/app/auth.go`** — JWT creation/validation and password hashing utilities.

**Database**: PostgreSQL at `$DATABASE_URL` (default points to `db` service). Schema is created/migrated in `store.go` at startup.

**Auth**: JWT (`golang-jwt/jwt v5`). The middleware in `server.go` validates tokens and injects claims into the request context.

**Uploads**: Signed upload sessions (stored in DB); files saved to `$UPLOAD_DIR`. Nginx proxies `/uploads/*` to the backend.

**RBAC**: Roles — `admin`, `owner`, `supervisor`, `helper`, `client`. Rules stored in `rbac_rules` table and enforced in the service layer.

### Frontend (`frontend/`)

Next.js 15 app with most logic concentrated in **`components/control-center.tsx`** — a single large React component that acts as a client-side SPA:

- Manages auth state (login/register flow)
- Loads demo data from `GET /api/v1/public/demo`
- Renders different views (public dashboard, owner panel, supervisor panel, client summary) based on role
- Uses Framer Motion for page transitions

`app/page.tsx` is just a shell that renders `<ControlCenter />`.

Styling is Tailwind CSS 4. The Next.js build outputs in standalone mode (no Node.js runtime needed in the container).

### Environment Variables (Backend)

| Variable | Default | Purpose |
|---|---|---|
| `APP_ADDR` | `:8080` | Listen address |
| `DB_PATH` | `/app/data/projectpulse.db` | SQLite file |
| `UPLOAD_DIR` | `/app/data/uploads` | File upload directory |
| `JWT_SECRET` | *(required)* | Signing key for JWTs |
| `PUBLIC_BASE_URL` | `http://localhost:1212` | Base URL for signed upload links |

### Environment Variables (Frontend)

| Variable | Purpose |
|---|---|
| `API_BASE_URL` | Backend URL used during Next.js build (SSR/ISR requests) |
