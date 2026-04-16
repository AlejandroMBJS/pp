import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.terms" });
  return { title: t("title"), description: t("intro") };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.terms" });
  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      <SiteHeader />
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-black mb-6">{t("title")}</h1>
        <p className="text-sm text-white/60 mb-8">{t("updated")}</p>
        <div className="prose prose-invert text-sm leading-relaxed space-y-4">
          <p>{t("intro")}</p>
          <h2 className="text-lg font-bold mt-6">{t("s1.title")}</h2>
          <p>{t("s1.body")}</p>
          <h2 className="text-lg font-bold mt-6">{t("s2.title")}</h2>
          <p>{t("s2.body")}</p>
          <h2 className="text-lg font-bold mt-6">{t("s3.title")}</h2>
          <p>{t("s3.body")}</p>
          <h2 className="text-lg font-bold mt-6">{t("s4.title")}</h2>
          <p>{t("s4.body")}</p>
          <h2 className="text-lg font-bold mt-6">{t("contact.title")}</h2>
          <p>{t("contact.body")}</p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
