---
name: frontend-guide
description: Use when editing Next.js 15 / React / Tailwind code in frontend/. Covers ProjectPulse component conventions, the control-center.tsx SPA pattern, auth state, role-based views, and demo data loading from /api/v1/public/demo.
---

# Frontend conventions (ProjectPulse)

## Stack
- Next.js 15 (App Router, standalone build output)
- React 19
- Tailwind CSS 4 (usa `@theme` en CSS, sin `tailwind.config.js` tradicional)
- Framer Motion para transiciones
- Build corre dentro de Docker — no instalar Node en el VPS

## Arquitectura
- Toda la lógica de UI vive en `components/control-center.tsx` (SPA cliente single-file)
- `app/page.tsx` solo monta `<ControlCenter />`
- Las vistas (public dashboard, owner panel, supervisor panel, client summary) se renderizan condicionalmente según el rol del usuario
- Auth state (login/register) manejado dentro de `control-center.tsx`
- Datos demo cargados desde `GET /api/v1/public/demo`

## Roles
`admin`, `owner`, `supervisor`, `helper`, `client` → cada uno ve un panel distinto. Las reglas RBAC viven en el backend (`rbac_rules` table), no duplicarlas en el frontend.

## API
- Llamadas vía `fetch` directo a `/api/v1/...`
- Nginx hace el proxy a backend:8080, así que no hace falta `API_BASE_URL` en runtime del cliente
- `API_BASE_URL` solo se usa en build time para SSR/ISR

## Patrones a seguir
- Preferir editar `control-center.tsx` antes que crear nuevos componentes sueltos — el proyecto es deliberadamente monolítico en el frontend para mantenerlo simple como demo
- Mantener tipos cerca del uso, no en archivos `types/` globales
- Tokens JWT van en el header `Authorization: Bearer <token>`
- Subidas de archivos: pedir sesión firmada al backend y subir a `/uploads/*` (Nginx proxy)

## Anti-patrones
- No introducir Redux, Zustand u otras libs de estado — `useState`/`useReducer` local es suficiente
- No fragmentar `control-center.tsx` en muchos archivos sin razón concreta
- No hardcodear URLs absolutas, usar paths relativos `/api/v1/...`
