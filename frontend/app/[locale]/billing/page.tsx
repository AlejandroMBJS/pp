import Link from "next/link";
import type { Metadata } from "next";
import { XCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "billingCancel.meta" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function BillingCancelPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "billingCancel" });
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] text-white p-6">
      <div className="max-w-md w-full bg-white/[0.03] border border-white/10 rounded-2xl p-8 text-center">
        <XCircle size={48} className="mx-auto mb-4 text-amber-400" />
        <h1 className="text-xl font-black mb-2">{t("title")}</h1>
        <p className="text-sm text-white/60 mb-6">{t("subtitle")}</p>
        <div className="flex flex-col gap-2">
          <Link
            href="/app"
            className="inline-block px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-black uppercase tracking-widest"
          >
            {t("backToDashboard")}
          </Link>
          <Link
            href="/pricing"
            className="inline-block px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-black uppercase tracking-widest text-white/70"
          >
            {t("viewPlans")}
          </Link>
        </div>
      </div>
    </div>
  );
}
