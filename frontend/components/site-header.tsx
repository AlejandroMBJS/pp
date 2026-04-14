"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

export function SiteHeader({
  current,
}: {
  current?: "home" | "pricing" | "login" | "signup" | "demo";
}) {
  const t = useTranslations("nav");
  const linkClass = (key: string) =>
    current === key ? "text-white" : "text-white/70 hover:text-white";
  return (
    <header className="border-b border-white/10 bg-[#0a0e1a]/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-sm font-black tracking-widest uppercase">
          <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)]" />
          ProjectPulse
        </Link>
        <nav className="flex items-center gap-5 text-xs font-semibold">
          <Link href="/#features" className="text-white/70 hover:text-white hidden sm:inline">
            {t("features")}
          </Link>
          <Link href="/pricing" className={linkClass("pricing")}>
            {t("pricing")}
          </Link>
          <Link href="/#faq" className="text-white/70 hover:text-white hidden sm:inline">
            {t("faq")}
          </Link>
          <Link href="/demo" className={linkClass("demo")}>
            {t("demo")}
          </Link>
          <Link href="/login" className={linkClass("login")}>
            {t("login")}
          </Link>
          <Link
            href="/signup"
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white uppercase tracking-widest"
          >
            {t("signup")}
          </Link>
        </nav>
      </div>
    </header>
  );
}
