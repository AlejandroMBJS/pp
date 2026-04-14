import Link from "next/link";
import {
  MapPin,
  Sparkles,
  ShieldCheck,
  Users,
  FileText,
  Download,
  Check,
  ArrowRight,
  Zap,
  Activity,
  Star,
  Quote,
  Building2,
  TrendingUp,
  Server,
  DatabaseBackup,
  Lock,
} from "lucide-react";
import { LandingSeo } from "@/components/landing-seo";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PLANS } from "@/lib/plans";

// Bypass Cloudflare / CDN caching so landing edits ship instantly.
export const revalidate = 0;

export const metadata = {
  title: "ProjectPulse — Control de calidad y evidencia geolocalizada para proyectos técnicos",
  description:
    "Plataforma SaaS multi-tenant para constructoras, supervisores y firmas técnicas. Evidencia geolocalizada, auditorías con IA y aprobación cliente en un solo lugar.",
};

const features = [
  {
    icon: MapPin,
    title: "Evidencia geolocalizada",
    body: "Cada captura con coordenadas, timestamp y responsable. Cero fotos sueltas sin contexto.",
  },
  {
    icon: Sparkles,
    title: "Auditorías con IA",
    body: "Revisa calidad automáticamente contra la spec técnica. Score y feedback accionable antes de facturar.",
  },
  {
    icon: ShieldCheck,
    title: "RBAC multi-tenant",
    body: "Admin, owner, supervisor, helper, cliente. Aislamiento estricto por empresa — cero filtraciones.",
  },
  {
    icon: Users,
    title: "Portal de cliente",
    body: "Tu cliente aprueba entregables y ve avance en su propio panel. Sin PDFs por WhatsApp.",
  },
  {
    icon: FileText,
    title: "Planos y CAD",
    body: "Sube DWG/DXF/PDF y liga tareas a zonas del proyecto. Tu equipo en campo sabe exactamente dónde.",
  },
  {
    icon: Download,
    title: "Exportes y reportes",
    body: "CSV y resúmenes ejecutivos listos para stakeholders. Traza completa para auditoría externa.",
  },
];

const stats = [
  { n: "72h", label: "Setup promedio hasta primer proyecto", icon: Zap },
  { n: "4.8★", label: "NPS con supervisores en campo", icon: Star },
  { n: "60%", label: "Reducción en retrabajos reportados", icon: TrendingUp },
  { n: "24/7", label: "Captura offline-first desde móvil", icon: Activity },
];

const steps = [
  { n: "01", title: "Registra tu empresa", body: "Alta en minutos. Trial de 14 días completo, sin tarjeta." },
  { n: "02", title: "Invita a tu equipo", body: "Supervisores, helpers y clientes con rol y permisos propios." },
  { n: "03", title: "Captura y aprueba", body: "Evidencia geolocalizada, auditoría con IA, cliente firma." },
];

const faqs = [
  {
    q: "¿Cómo funciona el trial?",
    a: "14 días gratis con todas las funciones del plan Professional. No pedimos tarjeta. Al final eliges plan o pasas a Starter gratis.",
  },
  {
    q: "¿Puedo cancelar cuando quiera?",
    a: "Sí. Desde tu portal de billing cancelas con un click y mantienes acceso hasta el final del período pagado.",
  },
  {
    q: "¿Dónde guardan los datos?",
    a: "Servidores propios en infra dedicada, con backups diarios encriptados. No compartimos datos entre tenants.",
  },
  {
    q: "¿Puedo exportar mis datos?",
    a: "Sí, exportes CSV/PDF en todos los planes pagos. Tu información es tuya, siempre.",
  },
  {
    q: "¿Ofrecen SSO/SAML?",
    a: "Sí, incluido en el plan Enterprise con integración a Okta, Azure AD y Google Workspace.",
  },
  {
    q: "¿Cómo funciona la auditoría con IA?",
    a: "Cuando subes una captura la analizamos contra la especificación técnica del entregable y devolvemos un score y puntos a corregir.",
  },
  {
    q: "¿Qué pasa si excedo los límites de mi plan?",
    a: "Te avisamos antes de llegar al límite y puedes hacer upgrade con un click — sin perder datos ni bloquear al equipo.",
  },
  {
    q: "¿Hay descuento por pago anual?",
    a: "Sí, en Professional y Business. Contacta ventas para el detalle y condiciones Enterprise.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#05070f] text-white overflow-hidden">
      <LandingSeo />
      <SiteHeader current="home" />

      {/* ═══ HERO ═══ */}
      <section className="relative">
        {/* Background mesh */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[800px] bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.25),transparent_60%)]" />
          <div className="absolute top-40 left-0 w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(34,211,238,0.12),transparent_60%)]" />
          <div className="absolute top-20 right-0 w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(168,85,247,0.1),transparent_60%)]" />
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
        </div>

        <div className="max-w-7xl mx-auto px-6 pt-20 pb-16 md:pt-28 md:pb-24 relative">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 backdrop-blur text-[10px] uppercase tracking-[0.25em] font-black text-blue-300 mb-8">
              <ShieldCheck size={12} />
              Strategic Control Console
              <span className="mx-1 h-1 w-1 rounded-full bg-white/20" />
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Live en producción
            </div>
            <h1 className="text-5xl md:text-7xl font-black leading-[1.05] tracking-tight mb-6">
              Building the
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-sky-400 to-cyan-400 bg-clip-text text-transparent animate-gradient-x">
                future of projects.
              </span>
            </h1>
            <p className="text-lg md:text-xl text-white/60 mb-4 leading-relaxed max-w-2xl mx-auto">
              Digitiza, supervisa y escala cualquier operación de proyecto con una sola plataforma
              técnica de control.
            </p>
            <p className="text-sm md:text-base text-white/40 mb-10 leading-relaxed max-w-2xl mx-auto">
              Reemplaza chats dispersos, carpetas de Drive y reportes manuales por evidencia
              geolocalizada, auditorías con IA y aprobación del cliente — todo en un panel
              multi-tenant.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
              <Link
                href="/signup"
                className="group relative inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-sm font-black uppercase tracking-widest shadow-[0_0_40px_rgba(59,130,246,0.4)] transition-all"
              >
                Empezar gratis
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-sm font-black uppercase tracking-widest backdrop-blur"
              >
                Ver demo en vivo
              </Link>
            </div>
            <p className="text-[11px] text-white/40">
              14 días gratis · Sin tarjeta · Cancela cuando quieras
            </p>
          </div>

          {/* Product mockup */}
          <div className="mt-16 md:mt-20 max-w-5xl mx-auto relative">
            <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/20 via-cyan-500/20 to-purple-500/20 rounded-3xl blur-2xl" />
            <div className="relative rounded-2xl border border-white/10 bg-[#0a0e1a]/80 backdrop-blur-xl overflow-hidden shadow-2xl">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-black/40">
                <div className="flex gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-500/60" />
                  <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
                  <span className="w-3 h-3 rounded-full bg-green-500/60" />
                </div>
                <div className="ml-4 flex-1 max-w-sm mx-auto px-3 py-1 rounded-md bg-white/5 text-[10px] text-white/40 font-mono text-center">
                  projpul.com/app
                </div>
              </div>
              {/* Fake dashboard content */}
              <div className="grid grid-cols-12 gap-0 min-h-[400px]">
                {/* Sidebar */}
                <aside className="col-span-3 border-r border-white/5 bg-black/20 p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                    <div className="h-3 w-24 bg-white/20 rounded" />
                  </div>
                  {["Dashboard", "Proyectos", "Tareas", "Evidencia", "Reportes", "Equipo"].map(
                    (label, i) => (
                      <div
                        key={label}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded ${
                          i === 1 ? "bg-blue-500/15 text-blue-300" : "text-white/40"
                        }`}
                      >
                        <div className="w-3 h-3 rounded bg-current opacity-50" />
                        <div className="text-[10px] font-semibold">{label}</div>
                      </div>
                    ),
                  )}
                </aside>
                {/* Main area */}
                <main className="col-span-9 p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-cyan-400 font-black mb-1">
                        Live Project
                      </div>
                      <div className="h-4 w-48 bg-white/20 rounded" />
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      En progreso
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { v: "92%", l: "Avance" },
                      { v: "24", l: "Tareas" },
                      { v: "$1.8M", l: "Budget" },
                      { v: "12", l: "Pendientes" },
                    ].map((k) => (
                      <div
                        key={k.l}
                        className="rounded-lg border border-white/10 bg-white/[0.02] p-3"
                      >
                        <div className="text-xl font-black bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">
                          {k.v}
                        </div>
                        <div className="text-[9px] uppercase tracking-widest text-white/40 font-bold">
                          {k.l}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="h-3 w-32 bg-white/20 rounded" />
                      <div className="text-[9px] text-white/40 font-bold">ÚLTIMA SEMANA</div>
                    </div>
                    <div className="flex items-end gap-1.5 h-20">
                      {[30, 55, 42, 78, 65, 88, 72, 95, 70, 85, 60, 92].map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-t bg-gradient-to-t from-blue-600 to-cyan-400"
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="flex-1 flex items-center gap-2 rounded border border-white/10 bg-white/[0.02] p-2"
                      >
                        <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-cyan-400" />
                        <div className="flex-1 space-y-1">
                          <div className="h-2 w-full bg-white/20 rounded" />
                          <div className="h-1.5 w-2/3 bg-white/10 rounded" />
                        </div>
                        <Check size={12} className="text-emerald-400" />
                      </div>
                    ))}
                  </div>
                </main>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ STATS STRIP ═══ */}
      <section className="border-y border-white/10 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 mb-3">
                  <s.icon size={18} />
                </div>
                <div className="text-3xl md:text-4xl font-black bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent mb-1">
                  {s.n}
                </div>
                <div className="text-[11px] text-white/50 uppercase tracking-widest font-bold">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="text-[11px] uppercase tracking-widest font-bold text-cyan-400 mb-3">
            Qué hace ProjectPulse
          </div>
          <h2 className="text-4xl md:text-5xl font-black mb-4 leading-tight">
            Todo lo que necesitas para cerrar proyectos a tiempo
          </h2>
          <p className="text-white/60 text-lg">
            Diseñado por y para equipos que viven en campo — no por un PM que nunca pisó una obra.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className="group relative rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:border-white/20 hover:bg-white/[0.04] transition-all overflow-hidden"
            >
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all" />
              <div className="relative">
                <div className="inline-flex p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border border-blue-500/20 text-cyan-300 mb-5">
                  <f.icon size={22} />
                </div>
                <h3 className="font-black text-xl mb-2">{f.title}</h3>
                <p className="text-sm text-white/60 leading-relaxed">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="border-t border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="text-[11px] uppercase tracking-widest font-bold text-cyan-400 mb-3">
              Cómo funciona
            </div>
            <h2 className="text-4xl md:text-5xl font-black leading-tight">
              De cero a producción en 72 horas
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {steps.map((s, i) => (
              <div key={s.n} className="relative rounded-2xl border border-white/10 bg-[#05070f] p-8 hover:border-white/20 transition-all">
                {i < steps.length - 1 && (
                  <ArrowRight
                    size={20}
                    className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 text-white/20"
                  />
                )}
                <div className="text-6xl font-black bg-gradient-to-br from-blue-400/80 to-cyan-300/50 bg-clip-text text-transparent mb-4 leading-none">
                  {s.n}
                </div>
                <h3 className="font-black text-xl mb-2">{s.title}</h3>
                <p className="text-sm text-white/60 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ TESTIMONIAL ═══ */}
      <section className="max-w-4xl mx-auto px-6 py-24">
        <div className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-blue-500/5 via-transparent to-cyan-500/5 p-10 md:p-14 overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
          <div className="relative">
            <Quote size={40} className="text-blue-400/40 mb-6" />
            <blockquote className="text-2xl md:text-3xl font-black leading-snug mb-8">
              "Pasamos de reportes en Excel y fotos por WhatsApp a tener evidencia auditada en
              minutos. Nuestros clientes firman entregables{" "}
              <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                3x más rápido.
              </span>
              "
            </blockquote>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center font-black text-lg">
                AG
              </div>
              <div>
                <div className="font-black">Arq. Ana García</div>
                <div className="text-[11px] text-white/50 uppercase tracking-widest font-bold">
                  Dir. Operaciones · Constructora Monterrey
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ INFRAESTRUCTURA ═══ */}
      <section className="border-t border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="text-[11px] uppercase tracking-widest font-bold text-cyan-400 mb-3">
              Infraestructura
            </div>
            <h2 className="text-4xl md:text-5xl font-black mb-4 leading-tight">
              Servidores dedicados,
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-sky-400 to-cyan-400 bg-clip-text text-transparent">
                no shared hosting.
              </span>
            </h2>
            <p className="text-white/60 text-lg">
              Military-grade infrastructure para equipos que no aceptan "lo que se pueda".
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                icon: Server,
                title: "Infra propia",
                body: "Servidores dedicados en México. Sin data residency extranjero, sin compartir CPU con otro SaaS. Latencia baja desde cualquier obra.",
              },
              {
                icon: DatabaseBackup,
                title: "Backups diarios",
                body: "Snapshots encriptados cada 24h con retención de 30 días. Recuperación point-in-time si algo explota a las 3am.",
              },
              {
                icon: Lock,
                title: "Aislamiento por tenant",
                body: "Row-level isolation con tenant_id en cada query. RBAC estricto: admin, owner, supervisor, helper, cliente. Cero filtraciones entre empresas.",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="group relative rounded-2xl border border-white/10 bg-[#05070f] p-6 hover:border-blue-500/30 transition-all overflow-hidden"
              >
                <div className="absolute -top-16 -right-16 w-40 h-40 bg-cyan-500/5 rounded-full blur-3xl group-hover:bg-cyan-500/15 transition-all" />
                <div className="relative">
                  <div className="inline-flex p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border border-blue-500/20 text-cyan-300 mb-5">
                    <card.icon size={22} />
                  </div>
                  <h3 className="font-black text-xl mb-2">{card.title}</h3>
                  <p className="text-sm text-white/60 leading-relaxed">{card.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section id="pricing" className="border-t border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="text-[11px] uppercase tracking-widest font-bold text-cyan-400 mb-3">
              Precios
            </div>
            <h2 className="text-4xl md:text-5xl font-black mb-4 leading-tight">
              Planes para cualquier tamaño
            </h2>
            <p className="text-white/60 text-lg">
              Empieza gratis y escala cuando lo necesites. Sin sorpresas, sin costos ocultos.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-2xl border p-6 flex flex-col ${
                  plan.highlight
                    ? "border-blue-500/50 bg-gradient-to-br from-blue-500/10 to-cyan-500/[0.03] shadow-[0_0_40px_rgba(59,130,246,0.15)]"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20"
                } transition-all`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 text-[9px] font-black uppercase tracking-widest">
                    Más popular
                  </div>
                )}
                <h3 className="font-black text-lg">{plan.name}</h3>
                <div className="mt-2 mb-3 flex items-baseline gap-1">
                  <span className="text-3xl font-black">{plan.priceDisplay}</span>
                  {plan.priceSuffix && (
                    <span className="text-[11px] text-white/40">{plan.priceSuffix}</span>
                  )}
                </div>
                <p className="text-[11px] text-white/50 mb-5 flex-1 leading-relaxed">
                  {plan.tagline}
                </p>
                <ul className="space-y-2 mb-6 text-[11px] text-white/70">
                  {plan.features.slice(0, 5).map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check size={13} className="text-cyan-400 shrink-0 mt-0.5" /> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.id === "enterprise" ? "/pricing#enterprise" : "/signup"}
                  className={`block text-center py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                    plan.highlight
                      ? "bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400"
                      : "bg-white/5 hover:bg-white/10 border border-white/10"
                  }`}
                >
                  {plan.id === "enterprise" ? "Contactar ventas" : "Empezar"}
                </Link>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 text-sm font-bold text-cyan-400 hover:text-cyan-300"
            >
              Ver comparación completa <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section id="faq" className="max-w-3xl mx-auto px-6 py-24">
        <div className="text-center mb-12">
          <div className="text-[11px] uppercase tracking-widest font-bold text-cyan-400 mb-3">
            FAQ
          </div>
          <h2 className="text-4xl md:text-5xl font-black leading-tight">Preguntas frecuentes</h2>
        </div>
        <div className="space-y-3">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group rounded-xl border border-white/10 bg-white/[0.02] p-5 open:border-white/20 open:bg-white/[0.04] transition-all"
            >
              <summary className="cursor-pointer font-bold text-sm flex items-center justify-between list-none">
                {f.q}
                <span className="text-white/40 group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="mt-3 text-sm text-white/60 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <section className="border-t border-white/5">
        <div className="max-w-4xl mx-auto px-6 py-24 text-center relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.15),transparent_60%)] pointer-events-none" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] uppercase tracking-widest font-bold text-cyan-300 mb-6">
              <Building2 size={12} /> Hecho para equipos técnicos
            </div>
            <h2 className="text-4xl md:text-6xl font-black mb-6 leading-tight">
              Deja de chatear.
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-cyan-400 bg-clip-text text-transparent">
                Empieza a entregar.
              </span>
            </h2>
            <p className="text-white/60 text-lg mb-10 max-w-xl mx-auto">
              14 días gratis con todas las funciones. Sin tarjeta, sin compromiso.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 px-10 py-5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-sm font-black uppercase tracking-widest shadow-[0_0_40px_rgba(59,130,246,0.4)]"
              >
                Crear cuenta gratis <ArrowRight size={16} />
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center justify-center gap-2 px-10 py-5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-black uppercase tracking-widest"
              >
                Solicitar demo
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
