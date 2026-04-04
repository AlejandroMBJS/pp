# SKILL-05: Helper — Captura optimizada para campo

## Objetivo
Optimizar la experiencia de captura de evidencias fotográficas en campo para el rol Helper (operario). Este es el rol que MÁS usa el móvil — todo su flujo es: llegar a obra → abrir cámara → tomar foto → subir.

## Contexto
- Helper tiene 2 vistas en `sidebar.tsx:77-81`: capture, history
- Se renderizan en `helper-canvas.tsx`
- `photo-upload-modal.tsx` maneja el upload de fotos
- En móvil: solo 2 iconos grandes (Capturar + Historial)
- El helper puede estar en obra con conexión limitada — la UX debe ser robusta

## Archivos a modificar

### `frontend/components/helper-canvas.tsx`
- Recibir prop `isMobile: boolean`
- **Vista Capture** (`capture`) — en móvil:
  - Botón GRANDE central "Tomar foto" (100% width, 64px height, icono de cámara)
  - Al tocar: abre `<input type="file" accept="image/*" capture="environment">` (cámara nativa del dispositivo)
  - Preview de la foto tomada con opciones:
    - Seleccionar tarea asociada (dropdown)
    - Descripción opcional (textarea, 2 líneas)
    - Botón "Subir" (prominente, verde)
    - Botón "Retomar" (secundario)
  - Indicador de upload con barra de progreso
  - Confirmación visual (checkmark + vibración si disponible)
  - Si hay fotos pendientes de subir (offline), mostrar badge "3 pendientes"
- **Vista History** (`history`) — en móvil:
  - Lista vertical de evidencias subidas por el helper
  - Card: thumbnail + fecha + tarea + status (pending/approved/rejected)
  - Status badges con colores claros (amarillo=pendiente, verde=aprobada, rojo=rechazada)
  - Si rechazada: mostrar motivo del rechazo
  - Pull-to-refresh

### `frontend/components/photo-upload-modal.tsx`
- Recibir `isMobile` prop
- En móvil: no usar modal — integrar el flujo directo en la vista capture
- Mantener el modal para desktop
- Compartir la lógica de upload/preview entre ambos modos

### `frontend/components/captures-canvas.tsx`
- Si el helper usa este componente, asegurar que en móvil:
  - Las imágenes se muestran en columna única
  - Preview táctil (tap para expandir)

## Mejoras UX específicas para campo

### Touch targets
- Todos los botones interactivos ≥ 56px height (operarios con guantes)
- Zona de tap generosa alrededor de íconos
- Feedback háptico en acciones importantes (navigator.vibrate)

### Cámara nativa
```html
<input
  type="file"
  accept="image/*"
  capture="environment"  <!-- cámara trasera -->
  onChange={handlePhotoCapture}
/>
```
- Comprimir imagen antes de upload (max 1600px width, 85% quality) usando canvas
- Extraer EXIF GPS si disponible para geolocalización automática

### Indicadores de estado claros
- Upload en progreso: barra animada + porcentaje
- Upload exitoso: checkmark verde + sonido sutil
- Upload fallido: retry automático cuando recupere conexión (nice-to-have)

## Criterios de aceptación
- [ ] Helper puede tomar foto directamente con cámara nativa del dispositivo
- [ ] Preview de foto con opción de retomar antes de subir
- [ ] Selector de tarea asociada funcional
- [ ] Barra de progreso durante upload
- [ ] Confirmación visual clara tras upload exitoso
- [ ] Historial muestra todas las evidencias del helper con status
- [ ] Evidencias rechazadas muestran motivo
- [ ] Touch targets ≥ 56px (uso con guantes)
- [ ] Imágenes se comprimen antes de subir (≤500KB)
- [ ] Funciona en Chrome Android y Safari iOS

## Dependencias
- SKILL-01 completado

## Estimación de complejidad
Media — 2 vistas simples pero con UX muy cuidada para campo.
