"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { Loader2, LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { SiteHeader } from "@/components/site-header";

const STORAGE_KEY = "projectpulse-session";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0e1a]" />}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY)) {
      router.replace("/app");
    }
  }, [router]);

  async function doLogin(creds: { email: string; password: string }) {
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creds),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? t("errors.invalid"));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    const rawNext = params.get("next");
    const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/app";
    router.replace(next);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError(t("errors.required"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await doLogin({ email: email.trim(), password });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      <SiteHeader current="login" />
      <main className="max-w-md mx-auto px-6 py-16">
        <h1 className="text-3xl font-black mb-2">{t("title")}</h1>
        <p className="text-sm text-white/60 mb-8">{t("subtitle")}</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-bold text-white/50 mb-1.5">
              {t("emailLabel")}
            </label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-blue-500/50"
              placeholder={t("emailPlaceholder")}
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-bold text-white/50 mb-1.5">
              {t("passwordLabel")}
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-blue-500/50"
              placeholder={t("passwordPlaceholder")}
            />
          </div>
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> {t("submitting")}
              </>
            ) : (
              <>
                <LogIn size={16} /> {t("submit")}
              </>
            )}
          </button>
        </form>
        <p className="text-center text-xs text-white/50 mt-6">
          {t("noAccount")}{" "}
          <Link href="/signup" className="text-cyan-400 hover:text-cyan-300 font-bold">
            {t("createOne")}
          </Link>
        </p>
        <div className="mt-8 pt-6 border-t border-white/5 text-center">
          <Link
            href="/demo"
            className="text-[11px] text-white/40 hover:text-white/70 font-semibold uppercase tracking-widest"
          >
            {t("tryDemo")}
          </Link>
        </div>
      </main>
    </div>
  );
}
