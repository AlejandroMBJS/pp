import Link from "next/link";
import type { Metadata } from "next";
import { Check } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PLANS } from "@/lib/plans";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pricing.meta" });
  return { title: t("title"), description: t("description") };
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pricing" });
  const tp = await getTranslations({ locale, namespace: "plans" });

  return (
    <div className="min-h-screen bg-[#05070f] text-white">
      <SiteHeader current="pricing" />

      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-black mb-4">{t("title")}</h1>
          <p className="text-white/60 max-w-2xl mx-auto">{t("subtitle")}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl border p-6 flex flex-col ${
                plan.highlight
                  ? "border-blue-500/50 bg-blue-500/[0.05] shadow-[0_0_24px_rgba(59,130,246,0.18)]"
                  : "border-white/10 bg-white/[0.02]"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-6 px-2 py-0.5 bg-blue-500 rounded-full text-[9px] font-black uppercase tracking-widest text-white">
                  {t("recommended")}
                </div>
              )}
              <h3 className="text-lg font-black">{tp(`${plan.id}.name`)}</h3>
              <p className="text-[11px] text-white/40 mt-0.5 min-h-[2.5em]">{tp(`${plan.id}.tagline`)}</p>
              <div className="mt-4 mb-5">
                <span className="text-3xl font-black">
                  {plan.priceAmount === null ? tp("priceCustom") : plan.priceDisplay}
                </span>
                {plan.priceAmount !== null && (
                  <span className="text-xs text-white/40 ml-1">{tp("priceSuffix")}</span>
                )}
              </div>
              <ul className="space-y-2 mb-6 flex-1">
                {(tp.raw(`${plan.id}.features`) as string[]).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-white/70">
                    <Check size={14} className="text-blue-400 shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={
                  plan.cta === "contact"
                    ? "/contact-sales"
                    : plan.cta === "signup"
                      ? "/signup"
                      : `/signup?plan=${plan.id}`
                }
                className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-center ${
                  plan.highlight
                    ? "bg-blue-600 hover:bg-blue-500 text-white"
                    : "bg-white/10 hover:bg-white/15 text-white"
                }`}
              >
                {tp(`${plan.id}.ctaLabel`)}
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-[11px] text-white/40 mt-10">{t("footnote")}</p>
      </main>
      <SiteFooter />
    </div>
  );
}
