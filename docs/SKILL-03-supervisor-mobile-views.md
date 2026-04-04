# SKILL-03: Vistas Supervisor optimizadas para móvil

## Objetivo
Adaptar las vistas del Supervisor para uso en campo — prioridad en revisar evidencias, ver planos y comunicarse.

## Contexto
- Supervisor tiene 7 vistas definidas en `sidebar.tsx:67-76`
- Se renderizan en `supervisor-canvas.tsx`
- En móvil, las 4 principales: Review queue, Planos, Mensajes, Gallery
- Las 3 en hamburger: Timeline, Finances, Daily log
- El supervisor es el rol que más usa móvil en campo — review de evidencias es su tarea #1

## Archivos a modificar

### `frontend/components/supervisor-canvas.tsx`
- Recibir prop `isMobile: boolean`
- Adaptaciones por vista:
  - **Review queue** (`review`): PRIORIDAD MÁXIMA en móvil
    - Cards de evidencia en stack vertical de una columna
    - Imagen grande (80% width) con tap para fullscreen
    - Botones Aprobar (verde, 48px) y Rechazar (rojo, 48px) debajo de cada evidencia
    - Campo de notas colapsable para rechazo
    - Badge con count de pendientes en el icono del bottom nav
    - Pull-to-refresh para recargar queue
  - **Timeline** (`timeline`): en móvil solo lista de tareas ordenada por fecha. Sin Gantt.
  - **Finances** (`finances`): reutiliza lógica de SKILL-02 (solo resumen cards)
  - **Daily log** (`journal`): en móvil permitir CREAR entrada rápida — solo textarea + botón "Agregar". No editor completo.
  - **Messages** (`messages`): reutiliza lógica de SKILL-02 (chat móvil completo)
  - **Blueprints** (`blueprints`): reutiliza lógica de SKILL-02 (viewer solo lectura con zoom táctil)
  - **Gallery** (`gallery`): grid de 2 columnas, tap para expandir, botones aprobar/rechazar

### `frontend/components/gantt-timeline.tsx`
- Recibir `isMobile` prop
- En móvil: renderizar como lista de tareas simple (no el chart Gantt)
  - Card por tarea: título, fechas, barra de progreso, assigned user
  - Ordenar por fecha de inicio
  - Colores por status (on-track/delayed/completed)

### `frontend/components/captures-canvas.tsx`
- Recibir `isMobile` prop
- En móvil para review: imágenes más grandes, gesture-friendly
- Carrusel horizontal de evidencias con botones de acción prominentes

## Criterios de aceptación
- [ ] Supervisor puede revisar y aprobar/rechazar evidencias cómodamente en móvil
- [ ] Touch targets de aprobación ≥48px
- [ ] Supervisor puede crear entradas rápidas en daily log desde móvil
- [ ] Timeline se muestra como lista ordenada (no Gantt)
- [ ] Gallery permite ver y actuar sobre evidencias
- [ ] Pull-to-refresh funciona en review queue
- [ ] Badge de pendientes se actualiza en bottom nav

## Dependencias
- SKILL-01 completado
- SKILL-02 parcialmente (reutiliza componentes de messaging, finances, blueprints)

## Estimación de complejidad
Media-Alta — supervisor-canvas.tsx es el principal cambio, más adaptación de Gantt.
