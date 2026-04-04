---
name: owner-mobile-views
description: Adaptar las vistas principales del Owner para que sean usables en pantallas menores a 768px, priorizando revisión de evidencias, planos y mensajes
compatibility: opencode
---

# SKILL-02: Vistas Owner optimizadas para móvil

## Objetivo
Adaptar las vistas principales del Owner para que sean usables en pantallas <768px, priorizando revisión de evidencias, planos y mensajes.

## Contexto
- Owner tiene 8 vistas definidas en `sidebar.tsx:44-66`
- Las vistas se renderizan en `owner-canvas.tsx` según `activeView`
- En móvil, las 4 vistas principales son: Revisiones (ownergallery), Planos, Mensajes, Progreso
- Las 4 secundarias (hamburger): Team, Finances, Daily log, Overview

## Archivos a modificar

### `frontend/components/owner-canvas.tsx`
- Recibir prop `isMobile: boolean`
- Para cada sección, aplicar layout condicional:
  - **Executive overview** (`overview`): en móvil mostrar solo métricas clave (health score, budget variance, active projects count) en stack vertical. Ocultar gráficos complejos.
  - **Projects** (`projects`): en móvil mostrar lista de proyectos como cards apiladas, sin timeline Gantt. Solo nombre + status + barra de progreso.
  - **Finances** (`finances`): en móvil solo resumen — total presupuesto, total gastado, varianza. Sin tabla detallada.
  - **Daily log** (`journal`): en móvil solo lectura de entradas recientes (scroll vertical). Sin formulario de nueva entrada.
  - **Messages** (`messages`): en móvil funcionalidad completa — lista de mensajes + input para enviar. Layout de chat estilo WhatsApp.
  - **Blueprints** (`blueprints`): en móvil solo visualización del plano con pinch-to-zoom. Sin controles de capas ni upload.
  - **Progress gallery** (`ownergallery`): en móvil funcionalidad completa de aprobar/rechazar. Cards de evidencia en columna única con botones grandes de aprobación.
  - **Team** (`team`): en móvil solo lista de miembros con rol y estado. Sin CRUD.

### `frontend/components/evidence-gallery.tsx`
- Recibir `isMobile` prop
- En móvil: grid de 1 columna, imágenes más grandes, botones de aprobación/rechazo prominentes (48px height mínimo para touch targets)
- Swipe left/right para rechazar/aprobar (opcional, nice-to-have)

### `frontend/components/financial-control.tsx`
- Recibir `isMobile` prop
- En móvil: ocultar tabla, mostrar solo 3 cards de resumen (Presupuesto total, Gastado, Varianza) apiladas verticalmente

### `frontend/components/daily-journal.tsx`
- Recibir `isMobile` prop
- En móvil: solo lectura. Entries como cards con fecha, autor, texto. Sin formulario de nueva entrada.

### `frontend/components/messaging-hub.tsx`
- Recibir `isMobile` prop
- En móvil: layout de chat de pantalla completa
  - Lista de conversaciones como pantalla principal
  - Al seleccionar: transición a vista de chat (back button en top)
  - Input fijo en bottom (encima del bottom nav)
  - Enviar con botón o Enter

### `frontend/components/plan-viewer.tsx` (blueprint viewer)
- Recibir `isMobile` prop
- En móvil: viewer solo-lectura, sin toolbar de capas
- Habilitar pinch-to-zoom y pan con gestos táctiles
- Botón de pantalla completa (fullscreen API)

## Criterios de aceptación
- [ ] Owner puede ver métricas de overview en móvil (resumidas)
- [ ] Owner puede ver lista de proyectos sin Gantt
- [ ] Owner puede aprobar/rechazar evidencias con touch targets ≥48px
- [ ] Owner puede ver planos con zoom/pan táctil
- [ ] Owner puede enviar/leer mensajes en formato chat móvil
- [ ] Todas las vistas hacen scroll vertical sin overflow horizontal
- [ ] No se rompe nada en desktop (prop isMobile=false mantiene comportamiento actual)

## Dependencias
- SKILL-01 completado (detección isMobile + MobileBottomNav)

## Estimación de complejidad
Alta — toca 6 componentes con adaptaciones responsivas significativas.
