# Propuesta: Web Móvil para ProjectPulse

## Análisis del Código Actual

La aplicación actual tiene una arquitectura bien definida:

- **Roles**: `owner`, `supervisor`, `helper`, `client`, `admin`
- **Vistas por rol** definidas en `sidebar.tsx:41-93`
- **Componentes responsive** limitados (sidebar dinámico con media queries en `globals.css:1283`)

---

## Propuesta por Rol

### 1. OWNER (Propietario)

| Funcionalidad | PC (completo) | Móvil (revisión) |
|---------------|---------------|------------------|
| Dashboard overview | ✅ Completo | ⚠️ Solo métricas clave |
| Gestión proyectos | ✅ Crear/editar | ❌ Solo ver |
| Timeline Gantt | ✅ Completo | ❌ Solo ver |
| Finances | ✅ Completo | ⚠️ Solo ver resumen |
| Daily log | ✅ Completo | ⚠️ Solo ver entradas |
| **Mensajes** | ✅ Completo | ✅ Solo lectura + enviar rápido |
| **Planos CAD** | ✅ Completo + upload + capas | ✅ Solo visualización |
| Gallery evidencias | ✅ Aprobar/rechazar | ✅ Solo aprobar/rechazar rápido |
| Team management | ✅ Completo | ❌ Solo ver lista |

**Cantidad iconos móvil**: 8 → 4 principales + hamburger con 4 restantes

**Iconos principales**: Revision (evidencias), Planos, Mensajes, Progreso
**En hamburger**: Team, Finances, Daily log, Overview

---

### 2. SUPERVISOR

| Funcionalidad | PC (completo) | Móvil (revisión) |
|---------------|---------------|------------------|
| Review queue | ✅ Completo | ✅ Aprobar/rechazar evidencias |
| Timeline Gantt | ✅ Completo | ❌ Solo ver |
| Finances | ✅ Completo | ❌ Solo ver |
| Daily log | ✅ Completo | ⚠️ Solo crear entrada rápida |
| **Mensajes** | ✅ Completo | ✅ Leer + enviar |
| **Planos CAD** | ✅ Upload + viewer | ✅ Solo visualización |
| Gallery | ✅ Aprobar/rechazar | ✅ Solo aprobar/rechazar |

**Cantidad iconos móvil**: 7 → 4 principales + hamburger con 3 restantes

**Iconos principales**: Revision (prioritario), Planos, Mensajes, Gallery
**En hamburger**: Timeline, Finances, Daily log

---

### 3. HELPER (Operario)

| Funcionalidad | PC (completo) | Móvil (revisión) |
|---------------|---------------|------------------|
| Capture progress | ✅ Upload + preview | ✅ Optimizado campo |
| History | ✅ Completo | ✅ Solo ver sus evidencias |

**Cantidad iconos móvil**: 2 → 2 iconos (capture + history)

**Iconos**: Capture, History

---

### 4. CLIENT (Cliente)

| Funcionalidad | PC (completo) | Móvil (revisión) |
|---------------|---------------|------------------|
| Project summary | ✅ Completo | ✅ Solo ver |
| **Planos CAD** | ✅ Solo ver | ✅ Solo visualización |
| Gallery evidencias | ✅ Solo ver aprobadas | ✅ Solo ver |

**Cantidad iconos móvil**: 3 → 3 iconos (summary + planos + gallery)

**Iconos**: Summary, Planos, Gallery

---

### 5. ADMIN

| Funcionalidad | PC (completo) | Móvil (revisión) |
|---------------|---------------|------------------|
| Platform stats | ✅ Completo | ⚠️ Solo métricas |
| RBAC | ✅ Completo | ❌ Bloqueado |

**Cantidad iconos móvil**: 2 → 2 iconos

**Recomendación**: Admin solo acceso web (bloquear móvil).

---

## Diseño del Menú Móvil

### Botón Flotante de Menú (Bottom Bar)

```
┌─────────────────────────────────────────┐
│                                         │
│           CONTENIDO PRINCIPAL           │
│         (según pestaña activa)          │
│                                         │
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐    │
│  │  🔔  │  │  📐  │  │  💬  │  │  ☰  │    │
│  │(rev) │  │(pln) │  │(msg) │  │     │    │
│  └─────┘  └─────┘  └─────┘  └─────┘    │
└─────────────────────────────────────────┘
```

### Lógica de Iconos

| Cantidad de vistas | Diseño |
|--------------------|--------|
| 4 vistas | 4 iconos en fila |
| 5 vistas | 5 iconos en fila |
| 6+ vistas | 4 iconos + hamburger con los restantes |

### Mapping de Iconos por Rol

```
OWNER:
  Principales:    [Revision] [Planos] [Mensajes] [Progreso]
  Hamburger:     [Team] [Finances] [Daily log] [Overview]
  
SUPERVISOR:
  Principales:    [Revision] [Planos] [Mensajes] [Gallery]
  Hamburger:     [Timeline] [Finances] [Daily log]
  
HELPER:
  Principales:    [Capture] [History]
  
CLIENT:
  Principales:    [Summary] [Planos] [Gallery]

ADMIN:
  Principales:    [Platform] [RBAC] (bloquear móvil)
```

### Comportamiento del Hamburger

Al presionar el hamburger:

- Aparece un dropdown/sheet con los iconos restantes
- Cada iconos es un botón que cambia la vista activa
- Incluye indicador de cantidad pendiente (ej: "3 pending")

---

## Implementación Técnica

### 1. Detección de Dispositivo

En `control-center.tsx`:

```typescript
const [isMobile, setIsMobile] = useState(false);

useEffect(() => {
  const checkMobile = () => setIsMobile(window.innerWidth < 768);
  checkMobile();
  window.addEventListener('resize', checkMobile);
  return () => window.removeEventListener('resize', checkMobile);
}, []);
```

### 2. Definición de Menú Móvil

En `sidebar.tsx`, agregar función:

```typescript
function mobileMenuForRole(role: string) {
  const menus = {
    owner: {
      main: [
        { id: "review",      icon: <FileCheck />,   label: "Revisiones" },
        { id: "blueprints",  icon: <Box />,         label: "Planos" },
        { id: "messages",    icon: <MessageSquare />, label: "Mensajes" },
        { id: "ownergallery",icon: <Camera />,      label: "Progreso" },
      ],
      hamburger: [
        { id: "team",        icon: <Users />,       label: "Team" },
        { id: "finances",    icon: <TrendingUp />, label: "Finanzas" },
        { id: "journal",     icon: <AlignLeft />,  label: "Diario" },
        { id: "overview",    icon: <LayoutDashboard />, label: "Resumen" },
      ]
    },
    supervisor: {
      main: [
        { id: "review",      icon: <FileCheck />,   label: "Revisiones" },
        { id: "blueprints",  icon: <Box />,         label: "Planos" },
        { id: "messages",    icon: <MessageSquare />, label: "Mensajes" },
        { id: "gallery",     icon: <Camera />,     label: "Galeria" },
      ],
      hamburger: [
        { id: "timeline",    icon: <Clock />,      label: "Timeline" },
        { id: "finances",    icon: <TrendingUp />, label: "Finanzas" },
        { id: "journal",     icon: <AlignLeft />,  label: "Diario" },
      ]
    },
    helper: {
      main: [
        { id: "capture",     icon: <Camera />,     label: "Capturar" },
        { id: "history",     icon: <FileCheck />,  label: "Historial" },
      ],
      hamburger: []
    },
    client: {
      main: [
        { id: "summary",     icon: <LayoutDashboard />, label: "Resumen" },
        { id: "blueprints",  icon: <Box />,         label: "Planos" },
        { id: "gallery",     icon: <Camera />,     label: "Galeria" },
      ],
      hamburger: []
    }
  };
  return menus[role] || { main: [], hamburger: [] };
}
```

### 3. Componente MobileBottomNav

Nuevo componente en `mobile-bottom-nav.tsx`:

```typescript
type MobileBottomNavProps = {
  role: string;
  activeView: string;
  onViewChange: (view: string) => void;
  pendingCount?: number;
};

export function MobileBottomNav({
  role,
  activeView,
  onViewChange,
  pendingCount = 0
}: MobileBottomNavProps) {
  const menu = mobileMenuForRole(role);
  const hasHamburger = menu.hamburger.length > 0;
  
  return (
    <div className="mobile-bottom-nav">
      {/* Iconos principales */}
      {menu.main.map((item) => (
        <button
          key={item.id}
          className={`nav-icon ${activeView === item.id ? 'active' : ''}`}
          onClick={() => onViewChange(item.id)}
        >
          <span className="icon-wrapper">{item.icon}</span>
          <span className="label">{item.label}</span>
        </button>
      ))}
      
      {/* Hamburger si hay más de 4 */}
      {hasHamburger && (
        <MobileHamburgerMenu
          items={menu.hamburger}
          onViewChange={onViewChange}
          activeView={activeView}
        />
      )}
    </div>
  );
}
```

### 4. Estilos CSS

En `globals.css`:

```css
/* Mobile Bottom Navigation */
.mobile-bottom-nav {
  display: none; /* Solo visible en móvil */
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 72px;
  background: var(--glass-bg);
  backdrop-filter: blur(16px);
  border-top: 1px solid var(--glass-border);
  padding: 8px 12px;
  justify-content: space-around;
  align-items: center;
  z-index: 100;
}

@media (max-width: 768px) {
  .mobile-bottom-nav {
    display: flex;
  }
  
  .canvas-area {
    padding-bottom: 88px !important;
  }
}

.nav-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 12px;
  border-radius: 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  min-width: 56px;
}

.nav-icon.active {
  background: rgba(59, 130, 246, 0.15);
}

.nav-icon .icon-wrapper {
  font-size: 20px;
  color: var(--text-secondary);
}

.nav-icon.active .icon-wrapper {
  color: var(--accent-blue);
}

.nav-icon .label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary);
}

.nav-icon.active .label {
  color: var(--accent-blue);
}

/* Hamburger Menu */
.hamburger-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 12px;
  border-radius: 12px;
  background: transparent;
  border: none;
  cursor: pointer;
}

.hamburger-sheet {
  position: fixed;
  bottom: 80px;
  left: 16px;
  right: 16px;
  background: var(--glass-bg);
  backdrop-filter: blur(24px);
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  animation: slideInUp 0.2s ease;
}
```

---

## UI Móvil por Rol

### Owner Móvil

```
┌─────────────────────────────────────────┐
│ ProjectPulse - Owner                   │
├─────────────────────────────────────────┤
│                                         │
│     CONTENIDO DE LA VISTA ACTIVA        │
│   (según icono seleccionado)            │
│                                         │
├─────────────────────────────────────────┤
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐    │
│  │ 🔔  │  │ 📐  │  │ 💬  │  │ ☰  │    │
│  │Rev. │  │Planos│ │Msjs │  │    │    │
│  └─────┘  └─────┘  └─────┘  └─────┘    │
└─────────────────────────────────────────┘
     ↑ 3 pend
```

### Supervisor Móvil

```
┌─────────────────────────────────────────┐
│ ProjectPulse - Supervisor              │
├─────────────────────────────────────────┤
│                                         │
│     CONTENIDO DE LA VISTA ACTIVA        │
│                                         │
├─────────────────────────────────────────┤
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐    │
│  │ 🔔  │  │ 📐  │  │ 💬  │  │ 📷  │    │
│  │Rev. │  │Planos│ │Msjs │  │Gal. │    │
│  └─────┘  └─────┘  └─────┘  └─────┘    │
└─────────────────────────────────────────┘
     ↑ 5 pend
```

### Helper Móvil

```
┌─────────────────────────────────────────┐
│ ProjectPulse - Operario                │
├─────────────────────────────────────────┤
│                                         │
│     CONTENIDO DE LA VISTA ACTIVA        │
│                                         │
├─────────────────────────────────────────┤
│  ┌─────┐  ┌─────┐                      │
│  │ 📷  │  │ 📋  │                      │
│  │Cap. │  │Hist.│                      │
│  └─────┘  └─────┘                      │
└─────────────────────────────────────────┘
```

### Client Móvil

```
┌─────────────────────────────────────────┐
│ ProjectPulse - Cliente                 │
├─────────────────────────────────────────┤
│                                         │
│     CONTENIDO DE LA VISTA ACTIVA        │
│                                         │
├─────────────────────────────────────────┤
│  ┌─────┐  ┌─────┐  ┌─────┐             │
│  │ 📊  │  │ 📐  │  │ 📷  │             │
│  │Res. │  │Planos│ │Gal. │             │
│  └─────┘  └─────┘  └─────┘             │
└─────────────────────────────────────────┘
```

---

## Resumen de Iconos por Rol

| Rol | Iconos Principales | Hamburger | Total |
|-----|-------------------|-----------|-------|
| **Owner** | 4 (Revision, Planos, Mensajes, Progreso) | 4 (Team, Finances, Diario, Overview) | 8 |
| **Supervisor** | 4 (Revision, Planos, Mensajes, Gallery) | 3 (Timeline, Finances, Diario) | 7 |
| **Helper** | 2 (Capture, History) | 0 | 2 |
| **Client** | 3 (Summary, Planos, Gallery) | 0 | 3 |
| **Admin** | 2 (Platform, RBAC) | 0 | 2 |

---

## Cambios en Backend

No hay cambios necesarios en el backend. La lógica existente ya soporta todas las funcionalidades móvil.

---

## Prioridades de Implementación

1. **Fase 1**: Componente MobileBottomNav + lógica de detección
2. **Fase 2**: Owner móvil (revisión + planos + mensajes)
3. **Fase 3**: Supervisor móvil (revisión evidencias)
4. **Fase 4**: Client móvil (solo visualización)
5. **Fase 5**: Helper optimización táctil

---

## Archivos a Modificar/Crear

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `frontend/components/mobile-bottom-nav.tsx` | **Crear** | Nuevo componente de navegación móvil |
| `frontend/components/mobile-hamburger-menu.tsx` | **Crear** | Menú desplegable hamburger |
| `frontend/components/control-center.tsx` | **Modificar** | Agregar detección isMobile y renderizar MobileBottomNav |
| `frontend/components/sidebar.tsx` | **Modificar** | Agregar función `mobileMenuForRole` |
| `frontend/app/globals.css` | **Modificar** | Agregar estilos para móvil |
| `frontend/app/layout.tsx` | **Modificar** | Ajustar padding para el bottom nav |