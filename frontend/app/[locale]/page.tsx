import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing.meta" });
  return { title: t("title"), description: t("description") };
}

const featureIcons = [MapPin, Sparkles, ShieldCheck, Users, FileText, Download];
const statIcons = [Zap, Star, TrendingUp, Activity];
const infraIcons = [Server, DatabaseBackup, Lock];

type FeatureItem = { title: string; body: string };
type StatItem = { n: string; label: string };
type StepItem = { n: string; title: string; body: string };
type FaqItem = { q: string; a: string };
type Kpi = { v: string; l: string };

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing" });
  const tp = await getTranslations({ locale, namespace: "plans" });

  const features = t.raw("features.items") as FeatureItem[];
  const stats = t.raw("stats.items") as StatItem[];
  const steps = t.raw("steps.items") as StepItem[];
  const faqs = t.raw("faq.items") as FaqItem[];
  const infraItems = t.raw("infra.items") as FeatureItem[];
  const sidebarLabels = t.raw("hero.mockup.sidebar") as string[];
  const kpis = t.raw("hero.mockup.kpis") as Kpi[];

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
              {t("hero.badge")}
              <span className="mx-1 h-1 w-1 rounded-full bg-white/20" />
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              {t("hero.liveBadge")}
            </div>
            <h1 className="text-5xl md:text-7xl font-black leading-[1.05] tracking-tight mb-6">
              {t("hero.headlineLine1")}
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-sky-400 to-cyan-400 bg-clip-text text-transparent animate-gradient-x">
                {t("hero.headlineLine2")}
              </span>
            </h1>
            <p className="text-lg md:text-xl text-white/60 mb-4 leading-relaxed max-w-2xl mx-auto">
              {t("hero.subheadline")}
            </p>
            <p className="text-sm md:text-base text-white/40 mb-10 leading-relaxed max-w-2xl mx-auto">
              {t("hero.subheadline2")}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
              <Link
                href="/signup"
                className="group relative inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-sm font-black uppercase tracking-widest shadow-[0_0_40px_rgba(59,130,246,0.4)] transition-all"
              >
                {t("hero.ctaPrimary")}
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-sm font-black uppercase tracking-widest backdrop-blur"
              >
                {t("hero.ctaSecondary")}
              </Link>
            </div>
            <p className="text-[11px] text-white/40">{t("hero.trustLine")}</p>
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
                  {sidebarLabels.map((label, i) => (
                    <div
                      key={label}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded ${
                        i === 1 ? "bg-blue-500/15 text-blue-300" : "text-white/40"
                      }`}
                    >
                      <div className="w-3 h-3 rounded bg-current opacity-50" />
                      <div className="text-[10px] font-semibold">{label}</div>
                    </div>
                  ))}
                </aside>
                {/* Main area */}
                <main className="col-span-9 p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-cyan-400 font-black mb-1">
                        {t("hero.mockup.liveProject")}
                      </div>
                      <div className="h-4 w-48 bg-white/20 rounded" />
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {t("hero.mockup.inProgress")}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {kpis.map((k) => (
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
                      <div className="text-[9px] text-white/40 font-bold">
                        {t("hero.mockup.lastWeek")}
                      </div>
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
            {stats.map((s, i) => {
              const Icon = statIcons[i] ?? Zap;
              return (
                <div key={s.label} className="text-center">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 mb-3">
                    <Icon size={18} />
                  </div>
                  <div className="text-3xl md:text-4xl font-black bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent mb-1">
                    {s.n}
                  </div>
                  <div className="text-[11px] text-white/50 uppercase tracking-widest font-bold">
                    {s.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="text-[11px] uppercase tracking-widest font-bold text-cyan-400 mb-3">
            {t("features.eyebrow")}
          </div>
          <h2 className="text-4xl md:text-5xl font-black mb-4 leading-tight">
            {t("features.title")}
          </h2>
          <p className="text-white/60 text-lg">{t("features.subtitle")}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => {
            const Icon = featureIcons[i] ?? MapPin;
            return (
              <div
                key={f.title}
                className="group relative rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:border-white/20 hover:bg-white/[0.04] transition-all overflow-hidden"
              >
                <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all" />
                <div className="relative">
                  <div className="inline-flex p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border border-blue-500/20 text-cyan-300 mb-5">
                    <Icon size={22} />
                  </div>
                  <h3 className="font-black text-xl mb-2">{f.title}</h3>
                  <p className="text-sm text-white/60 leading-relaxed">{f.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="border-t border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="text-[11px] uppercase tracking-widest font-bold text-cyan-400 mb-3">
              {t("steps.eyebrow")}
            </div>
            <h2 className="text-4xl md:text-5xl font-black leading-tight">
              {t("steps.title")}
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
              &ldquo;{t("testimonial.quotePart1")}{" "}
              <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                {t("testimonial.quoteHighlight")}
              </span>
              &rdquo;
            </blockquote>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center font-black text-lg">
                {t("testimonial.authorInitials")}
              </div>
              <div>
                <div className="font-black">{t("testimonial.authorName")}</div>
                <div className="text-[11px] text-white/50 uppercase tracking-widest font-bold">
                  {t("testimonial.authorRole")}
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
              {t("infra.eyebrow")}
            </div>
            <h2 className="text-4xl md:text-5xl font-black mb-4 leading-tight">
              {t("infra.titleLine1")}
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-sky-400 to-cyan-400 bg-clip-text text-transparent">
                {t("infra.titleLine2")}
              </span>
            </h2>
            <p className="text-white/60 text-lg">{t("infra.subtitle")}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {infraItems.map((card, i) => {
              const Icon = infraIcons[i] ?? Server;
              return (
                <div
                  key={card.title}
                  className="group relative rounded-2xl border border-white/10 bg-[#05070f] p-6 hover:border-blue-500/30 transition-all overflow-hidden"
                >
                  <div className="absolute -top-16 -right-16 w-40 h-40 bg-cyan-500/5 rounded-full blur-3xl group-hover:bg-cyan-500/15 transition-all" />
                  <div className="relative">
                    <div className="inline-flex p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border border-blue-500/20 text-cyan-300 mb-5">
                      <Icon size={22} />
                    </div>
                    <h3 className="font-black text-xl mb-2">{card.title}</h3>
                    <p className="text-sm text-white/60 leading-relaxed">{card.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section id="pricing" className="border-t border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="text-[11px] uppercase tracking-widest font-bold text-cyan-400 mb-3">
              {t("pricing.eyebrow")}
            </div>
            <h2 className="text-4xl md:text-5xl font-black mb-4 leading-tight">
              {t("pricing.title")}
            </h2>
            <p className="text-white/60 text-lg">{t("pricing.subtitle")}</p>
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
                    {t("pricing.mostPopular")}
                  </div>
                )}
                <h3 className="font-black text-lg">{tp(`${plan.id}.name`)}</h3>
                <div className="mt-2 mb-3 flex items-baseline gap-1">
                  <span className="text-3xl font-black">
                    {plan.priceAmount === null ? tp("priceCustom") : plan.priceDisplay}
                  </span>
                  {plan.priceAmount !== null && (
                    <span className="text-[11px] text-white/40">{tp("priceSuffix")}</span>
                  )}
                </div>
                <p className="text-[11px] text-white/50 mb-5 flex-1 leading-relaxed">
                  {tp(`${plan.id}.tagline`)}
                </p>
                <ul className="space-y-2 mb-6 text-[11px] text-white/70">
                  {(tp.raw(`${plan.id}.features`) as string[]).slice(0, 5).map((f) => (
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
                  {plan.id === "enterprise" ? t("pricing.contactSales") : t("pricing.startCta")}
                </Link>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 text-sm font-bold text-cyan-400 hover:text-cyan-300"
            >
              {t("pricing.compareAll")} <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section id="faq" className="max-w-3xl mx-auto px-6 py-24">
        <div className="text-center mb-12">
          <div className="text-[11px] uppercase tracking-widest font-bold text-cyan-400 mb-3">
            {t("faq.eyebrow")}
          </div>
          <h2 className="text-4xl md:text-5xl font-black leading-tight">{t("faq.title")}</h2>
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
              <Building2 size={12} /> {t("finalCta.badge")}
            </div>
            <h2 className="text-4xl md:text-6xl font-black mb-6 leading-tight">
              {t("finalCta.titleLine1")}
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-cyan-400 bg-clip-text text-transparent">
                {t("finalCta.titleLine2")}
              </span>
            </h2>
            <p className="text-white/60 text-lg mb-10 max-w-xl mx-auto">
              {t("finalCta.subtitle")}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 px-10 py-5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-sm font-black uppercase tracking-widest shadow-[0_0_40px_rgba(59,130,246,0.4)]"
              >
                {t("finalCta.ctaPrimary")} <ArrowRight size={16} />
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center justify-center gap-2 px-10 py-5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-black uppercase tracking-widest"
              >
                {t("finalCta.ctaSecondary")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
