# SKILL-04: Vistas Client optimizadas para móvil

## Objetivo
Dar al cliente una experiencia móvil limpia y de solo lectura para ver el avance de su proyecto.

## Contexto
- Client tiene 3 vistas definidas en `sidebar.tsx:82-87`: summary, gallery, blueprints
- Se renderizan en `client-canvas.tsx`
- En móvil: los 3 iconos se muestran en fila (sin hamburger)
- El cliente solo necesita VER — no edita, no sube, no aprueba

## Archivos a modificar

### `frontend/components/client-canvas.tsx`
- Recibir prop `isMobile: boolean`
- Adaptaciones por vista:
  - **Project summary** (`summary`):
    - En móvil: stack vertical con:
      1. Nombre del proyecto + status badge
      2. Barra de progreso circular o lineal (timeline_progress)
      3. Card de presupuesto (% consumido)
      4. Lista de deliverables como cards (título + due_date + status badge)
    - Ocultar datos técnicos que no le interesan al cliente
    - Diseño limpio, tipografía grande, mucho white space
  - **Gallery** (`gallery`):
    - Grid de 2 columnas con imágenes de evidencias aprobadas
    - Tap para expandir a fullscreen con swipe horizontal
    - Mostrar fecha y descripción debajo de cada foto
    - Solo evidencias con `is_visible_to_client=true`
  - **Blueprints** (`blueprints`):
    - Viewer de solo lectura (reutiliza lógica de SKILL-02)
    - Pinch-to-zoom + pan táctil
    - Sin toolbar de edición ni upload
    - Lista de planos disponibles como thumbnails en bottom sheet

### `frontend/components/client-canvas.tsx` — Fullscreen Image Viewer
- Agregar componente interno `MobileImageViewer`:
  - Fullscreen overlay negro
  - Swipe horizontal para navegar entre fotos
  - Pinch-to-zoom
  - Tap para cerrar o botón X
  - Counter "3 / 12" en top

## Criterios de aceptación
- [ ] Cliente puede ver resumen de su proyecto con progreso visual claro
- [ ] Cliente puede navegar galería de evidencias aprobadas
- [ ] Galería tiene fullscreen con swipe entre fotos
- [ ] Cliente puede ver planos con zoom táctil
- [ ] No hay ningún botón de edición/upload/aprobación visible
- [ ] Diseño limpio y profesional — esta es la cara al cliente
- [ ] Funciona correctamente en iPhone y Android (Safari + Chrome)

## Dependencias
- SKILL-01 completado
- SKILL-02 (reutiliza plan-viewer móvil)

## Estimación de complejidad
Media — solo 1 componente principal (client-canvas), vistas simples de solo lectura.
