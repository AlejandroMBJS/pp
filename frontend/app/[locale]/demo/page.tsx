"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { SiteHeader } from "@/components/site-header";

export default function DemoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0e1a]" />}>
      <DemoInner />
    </Suspense>
  );
}

type Status = "idle" | "submitting" | "success" | "error";

function DemoInner() {
  const params = useSearchParams();
  const t = useTranslations("demo");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [showResend, setShowResend] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resendStatus, setResendStatus] = useState<Status>("idle");

  async function onResend(e: FormEvent) {
    e.preventDefault();
    if (!resendEmail.trim()) return;
    setResendStatus("submitting");
    try {
      await fetch("/api/v1/public/demo-resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail.trim().toLowerCase() }),
      });
      setResendStatus("success");
    } catch {
      setResendStatus("success");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError(t("errors.required"));
      return;
    }
    setStatus("submitting");
    setError(null);
    try {
      const source = params.get("utm_source") || params.get("source") || "";
      const res = await fetch("/api/v1/public/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          company: company.trim(),
          source,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? t("errors.generic"));
      }
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.unexpected"));
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      <SiteHeader current="demo" />
      <main className="max-w-md mx-auto px-6 py-16">
        {status === "success" ? (
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 mb-6">
              <CheckCircle2 size={32} className="text-emerald-400" />
            </div>
            <h1 className="text-3xl font-black mb-3">{t("success.title")}</h1>
            <p className="text-sm text-white/60 leading-relaxed mb-8">
              {t("success.bodyPart1")}{" "}
              <strong className="text-white">{email}</strong>.
              <br />
              {t("success.bodyPart2")}
              <br />
              {t("success.bodyPart3")}{" "}
              <strong className="text-white">{t("success.bodyPart4")}</strong>
              {t("success.bodyPart5")}
            </p>
            <Link
              href="/login"
              className="inline-block px-6 py-3 rounded-xl bg-white text-black text-sm font-black uppercase tracking-widest"
            >
              {t("success.goToLogin")}
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-black mb-2">{t("title")}</h1>
            <p className="text-sm text-white/60 mb-8 leading-relaxed">{t("subtitle")}</p>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-white/50 mb-1.5">
                  {t("nameLabel")}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-blue-500/50"
                  placeholder={t("namePlaceholder")}
                  autoComplete="name"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-white/50 mb-1.5">
                  {t("emailLabel")}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-blue-500/50"
                  placeholder={t("emailPlaceholder")}
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-white/50 mb-1.5">
                  {t("companyLabel")} <span className="text-white/30 normal-case tracking-normal">{t("companyOptional")}</span>
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-blue-500/50"
                  placeholder={t("companyPlaceholder")}
                  autoComplete="organization"
                />
              </div>
              {error && (
                <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={status === "submitting"}
                className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {status === "submitting" ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> {t("submitting")}
                  </>
                ) : (
                  <>
                    <Mail size={16} /> {t("submit")}
                  </>
                )}
              </button>
            </form>
            <p className="text-center text-xs text-white/50 mt-6">
              {t("haveAccount")}{" "}
              <Link href="/login" className="text-cyan-400 hover:text-cyan-300 font-bold">
                {t("signIn")}
              </Link>
            </p>
            <div className="mt-6 pt-6 border-t border-white/5 text-center">
              {!showResend ? (
                <button
                  type="button"
                  onClick={() => setShowResend(true)}
                  className="text-xs text-white/50 hover:text-white/80 underline underline-offset-4"
                >
                  {t("resend.link")}
                </button>
              ) : resendStatus === "success" ? (
                <p className="text-xs text-emerald-400 font-semibold">{t("resend.sent")}</p>
              ) : (
                <form onSubmit={onResend} className="flex gap-2">
                  <input
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder={t("resend.placeholder")}
                    className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs focus:outline-none focus:border-blue-500/50"
                    autoComplete="email"
                  />
                  <button
                    type="submit"
                    disabled={resendStatus === "submitting" || !resendEmail.trim()}
                    className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold disabled:opacity-40"
                  >
                    {resendStatus === "submitting" ? "..." : t("resend.button")}
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
