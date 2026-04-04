# ProjectPulse

Dockerized MVP for investor demos and fast prototyping.

## Services

- `backend`: Go API with multi-tenant demo data and RBAC
- `frontend`: Next.js 15 web app with role-based workspaces
- `gateway`: Nginx reverse proxy exposing the app at `http://localhost:1212`

## Run

```bash
docker compose up --build
```
