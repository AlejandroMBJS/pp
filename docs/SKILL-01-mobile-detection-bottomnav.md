# SKILL-01: Detección móvil + MobileBottomNav

## Objetivo
Crear el sistema base de detección de dispositivo móvil y el componente `MobileBottomNav` que reemplaza el sidebar en pantallas <768px.

## Contexto
- El sidebar actual (`sidebar.tsx`) usa `menuForRole()` (líneas 41-93) para definir vistas por rol
- `control-center.tsx` maneja `activeView` (línea 263) y `sidebarOpen` (línea 233)
- El layout actual no tiene detección de móvil — el sidebar se oculta/muestra con un toggle

## Archivos a crear

### `frontend/components/mobile-bottom-nav.tsx`
Componente de navegación inferior fija con:
- Props: `role: string`, `activeView: string`, `onViewChange: (view: string) => void`
- Usa `mobileMenuForRole()` (definida en sidebar.tsx) para obtener iconos principales + hamburger
- Renderiza máx 4 iconos principales en fila + botón hamburger si hay más
- Icono activo: fondo `rgba(59, 130, 246, 0.15)`, color `var(--accent-blue)`
- Posición: `fixed bottom-0 left-0 right-0`, height 72px
- Solo visible en `@media (max-width: 768px)`
- Badge de notificación en icono de revisión (count de evidencias pendientes)

### `frontend/components/mobile-hamburger-menu.tsx`
Sheet/dropdown que aparece al tocar el hamburger:
- Posición: fixed, bottom 80px, left/right 16px
- Grid de 3 columnas con los ítems extra del rol
- Animación slide-up (0.2s ease)
- Backdrop overlay semitransparente para cerrar al tocar fuera
- Cada ítem muestra icono + label

## Archivos a modificar

### `frontend/components/sidebar.tsx`
- Exportar nueva función `mobileMenuForRole(role: string)` que retorna `{ main: MenuItem[], hamburger: MenuItem[] }`
- Mapping por rol (ver PROPUESTA líneas 173-219):
  - **owner**: main=[review, blueprints, messages, ownergallery], hamburger=[team, finances, journal, overview]
  - **supervisor**: main=[review, blueprints, messages, gallery], hamburger=[timeline, finances, journal]
  - **helper**: main=[capture, history], hamburger=[]
  - **client**: main=[summary, blueprints, gallery], hamburger=[]
  - **admin**: main=[platform, rbac], hamburger=[]
- Reusar los iconos de `MENU_ICONS` (líneas 16-39) con tamaño 20px en lugar de 16px

### `frontend/components/control-center.tsx`
- Agregar estado `isMobile` con hook de detección:
  ```typescript
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  ```
- Cuando `isMobile`:
  - Ocultar `<Sidebar>` completamente (no renderizar)
  - Renderizar `<MobileBottomNav>` con `activeView` y `onViewChange={setActiveView}`
  - Ocultar `<RightInspector>` (demasiado estrecho en móvil)
- Pasar `isMobile` como prop a los canvas que lo necesiten

### `frontend/app/globals.css`
- Agregar estilos para `.mobile-bottom-nav`, `.nav-icon`, `.nav-icon.active`, `.hamburger-sheet`
- Media query: `.canvas-area { padding-bottom: 88px !important; }` cuando hay bottom nav
- Ocultar sidebar en móvil: `@media (max-width: 768px) { .sidebar-container { display: none; } }`

## Criterios de aceptación
- [ ] En desktop (>768px): sidebar se muestra normal, bottom nav no aparece
- [ ] En móvil (<768px): sidebar desaparece, bottom nav aparece con iconos del rol
- [ ] Tocar un icono cambia `activeView` y carga la vista correcta
- [ ] Hamburger abre sheet con opciones extra (solo owner y supervisor)
- [ ] Tocar fuera del sheet lo cierra
- [ ] Transición fluida al redimensionar ventana (responsive)
- [ ] No se rompe ninguna funcionalidad existente en desktop

## Dependencias
Ninguna — este es el skill base.

## Estimación de complejidad
Media — 2 componentes nuevos + modificaciones menores a 3 existentes.
