# Plan de Suscripción y Pagos - ProjectPulse

## 1. Modelo de Negocio

### Trial Gratuito de 14 Días
- Sin necesidad de tarjeta de crédito para comenzar
- Al registrarse, el usuario tiene acceso completo a todas las funciones
- Día 1-14: Dashboard de "X días restantes" visible
- Día 15: Modal de upgrade obligatorio, acceso read-only hasta upgrade

### Estrategia de Monetización
- **Costo inicial**: Solo comisión por transacción (sin mensualidad fija durante trial)
- **Post-trial**: Suscripción mensual/annual según plan elegido
- **Revenue**: Suscripciones recurrentes + feature gates + uso adicional

---

## 2. Proveedor de Pagos Recomendado

### Stripe (Elección Principal)

| Característica | Detalle |
|---------------|---------|
| **Comisión por transacción** | 3.6% + MXN$3.00 (México) |
| **Setup fee** | $0 |
| **Monthly fee** | $0 |
| **Trial billing** | Sí, con Stripe Billing |
| **Dunning automático** | Sí (reintentos de pago fallidos) |
| **Integración** | Go backend + React frontend |

### Alternativas Consideradas

| Proveedor | Comisión | Ventaja | Desventaja |
|-----------|----------|---------|-------------|
| **Stripe** | 3.6% + MXN$3 | Líder mundial, docs excell | Comision alta para MX |
| **PayPal** | 4.5% + fija | Familiar en MX | UX inferior |
| **Conekta** | 3.5% + MXN$3 | Enfocado MX | Menos features |
| **MercadoPago** | 5.25% + IVA | Popular en LatAm | Solo LatAm |

**Recomendación**: Stripe por ecosistema maduro y Webhooks confiables.

---

## 3. Estructura de Planes

### Plan Starter (Gratuito - Trial)
**Ideal para**: Usuarios nuevos probando la plataforma

| Característica | Límite |
|---------------|--------|
| **Proyectos activos** | 1 |
| **Clientes/ tenants** | 1 |
| **Usuarios internos** | 3 (owner + 2) |
| **Clientes invitados** | 5 |
| **Capturas/mes** | 50 |
| **Almacenamiento** | 1 GB |
| **Planos CAD** | 3 archivos |
| **Mensajes** | 100/mes |
| **Trial** | 14 días |

**Precio post-trial**: $199 USD/mes (o $1,990 USD/año - 2 meses gratis)

---

### Plan Professional
**Ideal para**: PYMES con 1-3 proyectos simultáneos

| Característica | Límite |
|---------------|--------|
| **Proyectos activos** | 5 |
| **Clientes/ tenants** | 3 |
| **Usuarios internos** | 15 |
| **Clientes invitados** | 25 |
| **Capturas/mes** | 500 |
| **Almacenamiento** | 10 GB |
| **Planos CAD** | 25 archivos |
| **Mensajes** | Ilimitados |
| **AI features** | Básico (quality score) |
| **Integraciones** | Slack, Google Drive |

**Precio**: $499 USD/mes (o $4,990 USD/año - 2 meses gratis)

---

### Plan Business
**Ideal para**: Empresas medianas o constructoras con múltiples proyectos

| Característica | Límite |
|---------------|--------|
| **Proyectos activos** | 20 |
| **Clientes/ tenants** | 10 |
| **Usuarios internos** | 50 |
| **Clientes invitados** | 100 |
| **Capturas/mes** | 2,000 |
| **Almacenamiento** | 50 GB |
| **Planos CAD** | 100 archivos |
| **Mensajes** | Ilimitados |
| **AI features** | Completo (análisis, predictions) |
| **Integraciones** | Todas + API access |
| **Soporte** | Prioritario |
| **SSO/SAML** | Opcional addon |

**Precio**: $999 USD/mes (o $9,990 USD/año - 2 meses gratis)

---

### Plan Enterprise
**Ideal para**: Grandes constructoras o firmas de项目管理

| Característica | Límite |
|---------------|--------|
| **Proyectos activos** | Ilimitados |
| **Clientes/ tenants** | Ilimitados |
| **Usuarios internos** | Ilimitados |
| **Clientes invitados** | Ilimitados |
| **Capturas/mes** | Ilimitadas |
| **Almacenamiento** | 500 GB |
| **Planos CAD** | Ilimitados |
| **Mensajes** | Ilimitados |
| **AI features** | Completo + Custom |
| **Integraciones** | Todas + Custom |
| **Soporte** | 24/7 dedicado |
| **SSO/SAML** | Incluido |
| **SLA** | 99.9% uptime |
| **On-premise** | Opcional |
| **Custom contracts** | Sí |

**Precio**: $2,499 USD/mes (o $24,990 USD/año) o custom quote

---

## 4. Add-ons (Opcionales)

| Add-on | Precio | Descripción |
|--------|--------|-------------|
| **+10 usuarios** | $50 USD/mes | Usuarios internos adicionales |
| **+50 GB storage** | $25 USD/mes | Almacenamiento extra |
| **SSO/SAML** | $100 USD/mes | Autenticación enterprise |
| **API access** | $200 USD/mes | Endpoints REST/GraphQL |
| **White-label** | $500 USD/mes | Tu branding en login/emails |
| **Priority support** | $150 USD/mes | < 4hr response time |

---

## 5. Feature Gates por Plan

### Funcionalidades por Tier

| Feature | Starter | Professional | Business | Enterprise |
|---------|---------|--------------|----------|------------|
| Dashboard básico | ✅ | ✅ | ✅ | ✅ |
| Timeline Gantt | ✅ | ✅ | ✅ | ✅ |
| Captura evidencias | ✅ | ✅ | ✅ | ✅ |
| Revisión evidencias | ✅ | ✅ | ✅ | ✅ |
| Mensajería | ✅ | ✅ | ✅ | ✅ |
| Planos CAD viewer | ✅ | ✅ | ✅ | ✅ |
| Upload Planos CAD | ❌ | ✅ | ✅ | ✅ |
| Gallery avanzada | ❌ | ✅ | ✅ | ✅ |
| AI Quality Score | Básico | ✅ | ✅ | ✅ |
| AI Predictions | ❌ | ❌ | ✅ | ✅ |
| Export CSV/PDF | ❌ | ✅ | ✅ | ✅ |
| API Access | ❌ | Add-on | ✅ | ✅ |
| Custom fields | ❌ | ❌ | ✅ | ✅ |
| Audit log | ❌ | ❌ | ✅ | ✅ |
| SSO/SAML | ❌ | ❌ | Add-on | ✅ |
| Multi-tenant | ❌ | ❌ | ✅ | ✅ |
| White-label | ❌ | ❌ | Add-on | ✅ |

---

## 6. Flujo de Trial y Upgrade

```
[Registro]
    ↓
[Día 1-14: Trial activo]
    ↓
[Badge "X días restantes" en header]
    ↓
[Día 14: Modal de upgrade]
    ├── Opción 1: Elegir plan (Stripe Checkout)
    ├── Opción 2: Continuar con read-only
    └── Opción 3: Hablar con ventas (Enterprise)
    ↓
[Pago exitoso → Trial → Suscripción activa]
```

### Modal de Upgrade (Día 14)

```
┌─────────────────────────────────────────┐
│  🔔 Tu trial expira en 3 días          │
├─────────────────────────────────────────┤
│                                         │
│  ¿Qué incluye el upgrade?               │
│                                         │
│  ✅ Proyectos ilimitados                │
│  ✅ Usuarios ilimitados                  │
│  ✅ Almacenamiento 100GB                 │
│  ✅ AI Predictions                       │
│  ✅ Priority support                     │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Professional    $499/mes        │   │
│  │ [Elegir plan]                   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ¿Necesitas más? Contáctanos           │
│  [Ver comparativa de planes]            │
│                                         │
│  [Continuar sin features premium]        │
└─────────────────────────────────────────┘
```

---

## 7. Implementación Técnica

### Stack de Pagos

```
┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   Stripe.js     │
│   (Next.js)     │     │   Elements      │
└─────────────────┘     └─────────────────┘
                               │
                               ▼
┌─────────────────┐     ┌─────────────────┐
│   Backend       │────▶│   Stripe API    │
│   (Go)          │     │   (Webhooks)    │
└─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│   PostgreSQL    │
│   (subscriptions table) │
└─────────────────┘
```

### Tablas de Base de Datos

```sql
-- Subscriptions
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  plan TEXT NOT NULL, -- starter, professional, business, enterprise
  status TEXT NOT NULL, -- trialing, active, past_due, canceled
  trial_ends_at TIMESTAMP,
  current_period_ends_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Usage metrics (for metering)
CREATE TABLE usage_metrics (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  metric_type TEXT NOT NULL, -- captures, storage_mb, users, etc
  usage_value INTEGER DEFAULT 0,
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Payment events (audit)
CREATE TABLE payment_events (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  event_type TEXT NOT NULL, -- subscription_created, payment_succeeded, payment_failed, etc
  stripe_event_id TEXT,
  amount_cents INTEGER,
  status TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### API Endpoints de Billing

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/v1/billing/create-customer` | Crear cliente en Stripe |
| POST | `/api/v1/billing/create-subscription` | Iniciar subscription con trial |
| POST | `/api/v1/billing/portal` | Stripe customer portal |
| POST | `/api/v1/billing/checkout` | Checkout session para upgrade |
| POST | `/api/v1/billing/webhook` | Webhook de Stripe |
| GET | `/api/v1/billing/usage` | Uso actual del tenant |
| GET | `/api/v1/billing/subscription` | Estado de suscripción |

### Webhook Events a Manejar

| Event | Acción |
|-------|--------|
| `customer.subscription.created` | Activar trial, guardar subscription_id |
| `customer.subscription.updated` | Actualizar status, period dates |
| `customer.subscription.deleted` | Marcar como canceled |
| `invoice.payment_succeeded` | Confirmar pago, extender period |
| `invoice.payment_failed` | Notificar usuario, aplicar dunning |
| `customer.subscription.trial_will_end` | Enviar email recordatorio |

---

## 8. Lógica de Feature Gating

```go
// Feature flags por plan
var planFeatures = map[string][]string{
    "starter": {
        "dashboard", "timeline", "captures", "review", 
        "messages", "blueprints_view", "basic_quality_score",
    },
    "professional": {
        "dashboard", "timeline", "captures", "review", 
        "messages", "blueprints_upload", "gallery_advanced",
        "quality_score", "exports", "integrations_basic",
    },
    "business": {
        "dashboard", "timeline", "captures", "review", 
        "messages", "blueprints_upload", "gallery_advanced",
        "quality_score", "ai_predictions", "exports", 
        "api_access", "custom_fields", "audit_log", "integrations_all",
    },
    "enterprise": {
        // todas las features
    },
}

// Check access
func HasFeature(tenantID string, feature string) bool {
    sub := getSubscription(tenantID)
    if sub == nil {
        return false // trial ended
    }
    
    features := planFeatures[sub.Plan]
    for _, f := range features {
        if f == feature {
            return true
        }
    }
    return false
}
```

---

## 9. UX de Paywall

### Cuando usuario intenta feature bloqueada

```
┌─────────────────────────────────────────┐
│  🔒 Feature no disponible                │
├─────────────────────────────────────────┤
│                                         │
│  Esta función requiere                  │
│  [Professional Plan]                     │
│                                         │
│  [Ver todos los planes]                │
│  [Upgrade ahora - $499/mes]            │
│                                         │
│  ¿Ya tienes un código promocional?       │
│  [Ingresar código]                     │
└─────────────────────────────────────────┘
```

### Locked UI State

```
┌─────────────────────────────────────────┐
│  📐 Planos CAD              🔒         │
│                                         │
│  [Upgrade para subir archivos CAD]       │
│                                         │
└─────────────────────────────────────────┘
```

---

## 10. Estrategia de Conversión

### Email Nurturing (Trial)

| Día | Email | Objetivo |
|-----|-------|----------|
| Día 1 | Bienvenida + Setup guide | Onboarding |
| Día 3 | Tips: 3 features clave | Engagement |
| Día 7 | Case study de éxito | Social proof |
| Día 10 | Preview: Qué incluye upgrade | Consideración |
| Día 13 | "Último día" recordatorio | Urgencia |
| Día 15 | Trial ended + CTAs | Conversión |

### Off-boarding Trial (Si no convierte)

```
[Día 15: Trial ended]
    ↓
[Modo read-only por 7 días]
    ↓
[Día 22: Data export предложение]
    ↓
[Día 30: Account suspension]
    ↓
[Delete después de 90 días inactive]
```

---

## 11. Discounts y Promociones

| Tipo | Descuento | Aplicación |
|------|-----------|------------|
| **Annual billing** | 2 meses gratis (≈17% off) | Todos los planes |
| **Startup discount** | 50% off por 1 año | < 1 año, < $100K funding |
| **Non-profit** | 30% off | Con comprobante 501(c) |
| **Volume (10+ seats)** | 15% off | Enterprise negotiation |
| **Referral** | 1 mes gratis | Por cada cliente referido |
| **Promo code** | Variable | Marketing campaigns |

---

## 12. Métricas de Suscripción

### KPIs a Monitorear

| Métrica | Target | Descripción |
|---------|--------|-------------|
| **Trial-to-paid conversion** | > 25% | % trials que pagan |
| **Churn rate** | < 5%/mes | % que cancelan |
| **MRR growth** | > 10%/mes | Revenue recurrente mensual |
| **CAC** | < $200 USD | Costo de adquisición |
| **LTV** | > $2,000 USD | Valor de vida del cliente |
| **Payback period** | < 6 meses | Tiempo en recuperar CAC |

### Dashboard de Billing (Admin)

```
┌─────────────────────────────────────────┐
│  Billing Overview          [Mes actual] │
├─────────────────────────────────────────┤
│                                         │
│  MRR: $45,230 USD      ↑ 12% vs mes    │
│  Trials activos: 47                     │
│  Conversión trial→paid: 28%            │
│  Churn: 3.2%                          │
│                                         │
│  [Planes]                              │
│  Starter: 89 (89 free)                 │
│  Professional: 23                       │
│  Business: 12                           │
│  Enterprise: 3                         │
│                                         │
│  [Revenue by plan]                     │
│  Professional: $11,477                 │
│  Business: $11,988                     │
│  Enterprise: $21,765                   │
│                                         │
└─────────────────────────────────────────┘
```

---

## 13. Recomendaciones de Implementación

### Fase 1: MVP de Pagos (Semana 1-2)
1. Crear cuenta Stripe
2. Integrar Stripe.js en frontend
3. Backend: crear customer, subscription con trial
4. Webhook handler básico
5. Feature gates simples (en código, no DB)

### Fase 2: Sistema Completo (Semana 3-4)
1. UI de upgrade/paywall
2. Modal de trial ending
3. Customer portal integration
4. Usage tracking
5. Email notifications

### Fase 3: Analytics (Semana 5-6)
1. Dashboard de métricas
2. Churn tracking
3. Revenue forecasting
4. Dunning automation
5. A/B testing de pricing

---

## 14. Anexos

### Stripe Checkout (México - Comisiones Reales)

| Escenario | Costo |
|-----------|-------|
| Venta $1,000 MXN | $39 MXN |
| Venta $5,000 MXN | $183 MXN |
| Venta $10,000 MXN | $363 MXN |
| Suscripción $499 USD/mes | $18.50 USD/mes |

### ROI Calculator para Clientes

```
Proyecto típico (5 usuarios, 2 proyectos)
├── Sin ProjectPulse: $500 USD/mes (herramientas separadas)
├── Con ProjectPulse: $499 USD/mes (todo en uno)
└── Ahorro: $1 USD/mes + 20hrs/mes productividad
```

---

## Resumen: Plan de Implementación

| Fase | Tiempo | Costo Setup | Costo Mensual |
|------|--------|-------------|---------------|
| MVP Pagos | 2 semanas | $0 | 3.6% por transacción |
| Sistema completo | 4 semanas | $0 | 3.6% + $0 platform |
| Enterprise ready | 8 semanas | $0 | 3.6% + $0 platform |

**Inversión inicial**: $0 (Stripe no cobra setup)
**Costo por transacción**: Solo comisión (descrita arriba)
**Costo mensual platform**: $0 (pay-as-you-go)

---

*Documento creado: Abril 2026*
*Última actualización: Abril 2026*
*Versión: 1.0*