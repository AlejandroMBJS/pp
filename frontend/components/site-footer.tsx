import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function SiteFooter() {
  const t = await getTranslations("footer");
  return (
    <footer className="border-t border-white/10 mt-20">
      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-xs">
        <div>
          <div className="text-sm font-black tracking-widest uppercase mb-3">ProjectPulse</div>
          <p className="text-white/40 leading-relaxed">{t("tagline")}</p>
        </div>
        <div>
          <div className="font-bold text-white/70 mb-3 uppercase tracking-widest">
            {t("productHeading")}
          </div>
          <ul className="space-y-2 text-white/50">
            <li><Link href="/#features" className="hover:text-white">{t("features")}</Link></li>
            <li><Link href="/pricing" className="hover:text-white">{t("pricing")}</Link></li>
            <li><Link href="/#faq" className="hover:text-white">{t("faq")}</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-bold text-white/70 mb-3 uppercase tracking-widest">
            {t("companyHeading")}
          </div>
          <ul className="space-y-2 text-white/50">
            <li><Link href="/login" className="hover:text-white">{t("login")}</Link></li>
            <li><Link href="/signup" className="hover:text-white">{t("signup")}</Link></li>
            <li><a href="mailto:hola@projpul.com" className="hover:text-white">{t("contact")}</a></li>
          </ul>
        </div>
        <div>
          <div className="font-bold text-white/70 mb-3 uppercase tracking-widest">
            {t("legalHeading")}
          </div>
          <ul className="space-y-2 text-white/50">
            <li><Link href="/legal/terms" className="hover:text-white">{t("terms")}</Link></li>
            <li><Link href="/legal/privacy" className="hover:text-white">{t("privacy")}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/5 py-5 text-center text-[11px] text-white/30">
        {t("copyright", { year: new Date().getFullYear() })}
      </div>
    </footer>
  );
}
