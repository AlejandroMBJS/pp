"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
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
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError("Nombre y email son requeridos");
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
        throw new Error(data.error ?? "No pudimos procesar tu solicitud");
      }
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
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
            <h1 className="text-3xl font-black mb-3">¡Listo!</h1>
            <p className="text-sm text-white/60 leading-relaxed mb-8">
              Te enviamos las credenciales a{" "}
              <strong className="text-white">{email}</strong>.
              <br />
              Revisa tu bandeja (y spam por si acaso).
              <br />
              El acceso expira en <strong className="text-white">72 horas</strong>.
            </p>
            <Link
              href="/login"
              className="inline-block px-6 py-3 rounded-xl bg-white text-black text-sm font-black uppercase tracking-widest"
            >
              Ir a Login →
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-black mb-2">Solicita un demo</h1>
            <p className="text-sm text-white/60 mb-8 leading-relaxed">
              Te creamos un workspace privado con datos de ejemplo y te enviamos las
              credenciales por email. Acceso válido por 72 horas, sin tarjeta.
            </p>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-white/50 mb-1.5">
                  Nombre completo
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-blue-500/50"
                  placeholder="Ana García"
                  autoComplete="name"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-white/50 mb-1.5">
                  Email corporativo
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-blue-500/50"
                  placeholder="tu@empresa.com"
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-white/50 mb-1.5">
                  Empresa <span className="text-white/30 normal-case tracking-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-blue-500/50"
                  placeholder="Constructora XYZ"
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
                    <Loader2 size={16} className="animate-spin" /> Enviando...
                  </>
                ) : (
                  <>
                    <Mail size={16} /> Enviarme credenciales
                  </>
                )}
              </button>
            </form>
            <p className="text-center text-xs text-white/50 mt-6">
              ¿Ya tienes cuenta?{" "}
              <Link href="/login" className="text-cyan-400 hover:text-cyan-300 font-bold">
                Entrar
              </Link>
            </p>
          </>
        )}
      </main>
    </div>
  );
}
