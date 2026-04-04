---
name: mobile-polish-testing
description: Asegurar que toda la experiencia móvil es consistente, sin bugs visuales, y funciona en dispositivos reales
compatibility: opencode
---

# SKILL-06: Pulido general móvil + testing cross-browser

## Objetivo
Asegurar que toda la experiencia móvil es consistente, sin bugs visuales, y funciona en los dispositivos reales del equipo.

## Contexto
- Después de SKILL-01 a SKILL-05, todas las vistas tienen modo móvil
- Este skill es para detectar y corregir problemas de integración, edge cases, y pulido visual
- Los usuarios reales usarán: iPhone (Safari), Android (Chrome), tablets (ambos)

## Tareas

### 1. TopBar responsive
**Archivo**: `frontend/components/topbar.tsx`
- En móvil: simplificar topbar
  - Logo más pequeño o solo icono
  - Nombre del proyecto truncado con ellipsis
  - Ocultar elementos no esenciales
  - Hamburger menu si necesario para settings/logout
  - Height reducido (48px vs 64px en desktop)

### 2. Layout general
**Archivo**: `frontend/app/layout.tsx`
- Asegurar `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">` para evitar zoom accidental en inputs
- Agregar `<meta name="apple-mobile-web-app-capable" content="yes">` para modo webapp
- Agregar `<meta name="theme-color" content="#1a1a2e">` para barra de estado del navegador

### 3. Safe areas (notch/home indicator)
**Archivo**: `frontend/app/globals.css`
- Bottom nav debe respetar `env(safe-area-inset-bottom)` para iPhones con home indicator
  ```css
  .mobile-bottom-nav {
    padding-bottom: calc(8px + env(safe-area-inset-bottom));
    height: calc(72px + env(safe-area-inset-bottom));
  }
  ```
- TopBar debe respetar `env(safe-area-inset-top)` para notch

### 4. Scroll y overflow
- Verificar que ninguna vista tiene scroll horizontal accidental
- `overflow-x: hidden` en el contenedor principal en móvil
- Modales/sheets: prevenir scroll del body cuando están abiertos (`body.modal-open { overflow: hidden; }`)

### 5. Input focus behavior
- Cuando un input recibe focus en móvil, el teclado virtual empuja el contenido
- Asegurar que el bottom nav no se sobrepone al input activo
- En chat (messaging-hub): input debe quedar visible sobre el teclado

### 6. Transiciones entre vistas
- Al cambiar de vista en bottom nav: transición suave (opacity fade 150ms)
- No flash de contenido vacío entre cambios
- Mantener scroll position al volver a una vista previamente visitada (nice-to-have)

### 7. Loading states
- Skeleton screens para datos en carga (especialmente gallery y evidencias)
- Pull-to-refresh en vistas que cargan datos (review queue, history, gallery)

### 8. Bloqueo de admin en móvil
**Archivo**: `frontend/components/admin-canvas.tsx`
- Si `isMobile`: mostrar mensaje "Panel de administración solo disponible en escritorio"
- No renderizar ninguna funcionalidad admin en móvil

### 9. Testing matrix
Verificar en estos escenarios:
| Device | Browser | Rol a probar |
|--------|---------|-------------|
| iPhone 14/15 | Safari | Owner, Client |
| iPhone SE | Safari | Helper (pantalla pequeña) |
| Samsung Galaxy | Chrome | Supervisor, Helper |
| iPad | Safari | Owner (tablet landscape) |
| Android tablet | Chrome | Supervisor |

### 10. Performance móvil
- Lazy load de imágenes en gallery (`loading="lazy"`)
- Reducir bundle size: verificar que componentes pesados (Gantt, CAD viewer) no cargan en móvil
- Medir Lighthouse mobile score — target ≥70 performance

## Criterios de aceptación
- [ ] No hay scroll horizontal en ninguna vista móvil
- [ ] Safe areas respetadas en iPhone X+ (notch, home indicator)
- [ ] Teclado virtual no oculta inputs activos
- [ ] Bottom nav no se sobrepone a contenido
- [ ] Admin bloqueado en móvil con mensaje claro
- [ ] Transiciones suaves entre vistas
- [ ] Loading states visibles durante carga de datos
- [ ] Funciona en Safari iOS, Chrome Android, y tablets
- [ ] Lighthouse mobile ≥ 70

## Dependencias
- SKILL-01 a SKILL-05 completados

## Estimación de complejidad
Media — son muchos ajustes pequeños pero ninguno es arquitecturalmente complejo.
