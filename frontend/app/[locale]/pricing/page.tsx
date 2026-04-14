import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PLANS } from "@/lib/plans";
import { PlanCard } from "@/components/pricing/plan-card";
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto items-stretch">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              variant="full"
              texts={{
                name: tp(`${plan.id}.name`),
                tagline: tp(`${plan.id}.tagline`),
                features: tp.raw(`${plan.id}.features`) as string[],
                ctaLabel: tp(`${plan.id}.ctaLabel`),
                priceCustom: tp("priceCustom"),
                priceSuffix: tp("priceSuffix"),
                badgeLabel: tp("mostPopular"),
              }}
              ctaHref={
                plan.cta === "contact"
                  ? "/contact-sales"
                  : plan.cta === "signup"
                    ? "/signup"
                    : `/signup?plan=${plan.id}`
              }
            />
          ))}
        </div>

        <p className="text-center text-[11px] text-white/40 mt-10">{t("footnote")}</p>
      </main>
      <SiteFooter />
    </div>
  );
}
