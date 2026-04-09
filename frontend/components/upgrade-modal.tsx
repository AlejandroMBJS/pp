"use client";

import { useEffect, useState } from "react";
import { X, Check, Loader2, Sparkles } from "lucide-react";
import { useBilling } from "./billing-context";

type Plan = {
  id: "professional" | "business" | "enterprise";
  name: string;
  price: string;
  tagline: string;
  highlights: string[];
  recommended?: boolean;
};

const PLANS: Plan[] = [
  {
    id: "professional",
    name: "Professional",
    price: "$499 USD/mes",
    tagline: "Para PYMES con 1–5 proyectos simultáneos",
    highlights: ["5 proyectos activos", "15 usuarios internos", "500 capturas/mes", "10 GB storage", "Subir planos CAD", "Quality score IA", "Exportes CSV/PDF"],
    recommended: true,
  },
  {
    id: "business",
    name: "Business",
    price: "$999 USD/mes",
    tagline: "Para empresas medianas con múltiples proyectos",
    highlights: ["20 proyectos activos", "50 usuarios internos", "2,000 capturas/mes", "50 GB storage", "AI Predictions", "API Access", "Audit log"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "$2,499 USD/mes",
    tagline: "Para grandes constructoras y firmas",
    highlights: ["Proyectos ilimitados", "Usuarios ilimitados", "500 GB storage", "SSO/SAML", "White-label", "Soporte 24/7", "SLA 99.9%"],
  },
];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
  reason?: { type?: string; error?: string } | null;
};

export function UpgradeModal({ isOpen, onClose, token, reason }: Props) {
  const billing = useBilling();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setLoading(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function startCheckout(plan: Plan["id"]) {
    if (!token) return;
    setLoading(plan);
    setError(null);
    try {
      const res = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "checkout failed");
      window.location.href = data.checkout_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error iniciando checkout");
      setLoading(null);
    }
  }

  const reasonLabel = reason?.type === "quota_exceeded"
    ? "Llegaste al límite de tu plan actual"
    : reason?.type === "feature_locked"
      ? "Esta función requiere un plan superior"
      : reason?.type === "subscription_required"
        ? "Tu trial expiró"
        : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet modal-sheet-wide" style={{ maxWidth: 1100 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Upgrade tu plan</h2>
              {reasonLabel && <p className="text-xs text-amber-400 font-bold uppercase tracking-widest mt-0.5">{reasonLabel}</p>}
              {!reasonLabel && billing?.subscription.status === "trialing" && (
                <p className="text-xs text-white/50 uppercase tracking-widest font-bold">
                  Trial: {billing.subscription.days_until_trial_end} días restantes
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 text-white/50">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4 overflow-y-auto max-h-[70vh]">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl border p-5 flex flex-col ${
                plan.recommended
                  ? "border-blue-500/50 bg-blue-500/[0.04] shadow-[0_0_20px_rgba(59,130,246,0.15)]"
                  : "border-white/10 bg-white/[0.02]"
              }`}
            >
              {plan.recommended && (
                <div className="absolute -top-3 left-5 px-2 py-0.5 bg-blue-500 rounded-full text-[9px] font-black uppercase tracking-widest text-white">
                  Recomendado
                </div>
              )}
              <h3 className="text-lg font-black text-white">{plan.name}</h3>
              <p className="text-[11px] text-white/40 mt-0.5">{plan.tagline}</p>
              <div className="mt-3 mb-4">
                <span className="text-2xl font-black text-white">{plan.price.split(" ")[0]}</span>
                <span className="text-xs text-white/40 ml-1">{plan.price.split(" ").slice(1).join(" ")}</span>
              </div>
              <ul className="space-y-2 mb-5 flex-1">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-xs text-white/70">
                    <Check size={14} className="text-blue-400 shrink-0 mt-0.5" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => startCheckout(plan.id)}
                disabled={loading !== null}
                className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  plan.recommended
                    ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                    : "bg-white/10 hover:bg-white/15 text-white"
                } disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
              >
                {loading === plan.id ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Cargando...
                  </>
                ) : (
                  "Elegir plan"
                )}
              </button>
            </div>
          ))}
        </div>

        {error && (
          <div className="mx-6 mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
            {error}
          </div>
        )}

        <div className="px-6 pb-6 text-center">
          <p className="text-[11px] text-white/40">
            Pago seguro vía Stripe. Cancela cuando quieras desde el portal de billing.
          </p>
        </div>
      </div>
    </div>
  );
}
