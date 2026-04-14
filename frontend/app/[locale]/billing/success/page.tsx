"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

export default function BillingSuccessPage() {
  const [status, setStatus] = useState<"polling" | "active" | "timeout">("polling");

  useEffect(() => {
    let attempts = 0;
    const tokenKey = "projectpulse_session";
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(tokenKey) : null;
    const token = raw ? JSON.parse(raw).access_token : null;
    if (!token) return;

    async function poll() {
      attempts += 1;
      try {
        const res = await fetch("/api/v1/billing/subscription", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.subscription?.status === "active") {
            setStatus("active");
            setTimeout(() => (window.location.href = "/"), 2500);
            return;
          }
        }
      } catch {
        // ignore
      }
      if (attempts < 20) setTimeout(poll, 1500);
      else setStatus("timeout");
    }
    poll();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] text-white p-6">
      <div className="max-w-md w-full bg-white/[0.03] border border-white/10 rounded-2xl p-8 text-center">
        {status === "polling" && (
          <>
            <Loader2 size={42} className="mx-auto mb-4 text-blue-400 animate-spin" />
            <h1 className="text-xl font-black mb-2">Activando tu plan…</h1>
            <p className="text-sm text-white/60">Estamos confirmando el pago con Stripe. Esto toma unos segundos.</p>
          </>
        )}
        {status === "active" && (
          <>
            <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-400" />
            <h1 className="text-xl font-black mb-2">¡Plan activado!</h1>
            <p className="text-sm text-white/60">Te estamos llevando al dashboard…</p>
          </>
        )}
        {status === "timeout" && (
          <>
            <h1 className="text-xl font-black mb-2">Procesando…</h1>
            <p className="text-sm text-white/60 mb-4">El pago puede tardar un par de minutos en reflejarse. Si el problema persiste, contacta a soporte.</p>
            <a href="/" className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-black uppercase tracking-widest">
              Ir al dashboard
            </a>
          </>
        )}
      </div>
    </div>
  );
}
