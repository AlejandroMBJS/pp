"use client";

import { useEffect, useState } from "react";
import { X, Check, Loader2, Sparkles, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { useBilling } from "./billing-context";
import { PAID_PLANS, type PlanId } from "../lib/plans";

const MODAL_PLANS = PAID_PLANS;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
  reason?: { type?: string; error?: string } | null;
};

export function UpgradeModal({ isOpen, onClose, token, reason }: Props) {
  const billing = useBilling();
  const tp = useTranslations("plans");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showContact, setShowContact] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const [contact, setContact] = useState({ name: "", email: "", company: "", message: "" });

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setLoading(null);
      setShowContact(false);
      setContactSent(false);
      setContact({ name: "", email: "", company: "", message: "" });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function startCheckout(plan: PlanId) {
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

  async function submitContact() {
    if (!contact.name || !contact.email || !contact.company) {
      setError("Nombre, email y empresa son requeridos");
      return;
    }
    setLoading("enterprise");
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch("/api/v1/billing/contact-sales", {
        method: "POST",
        headers,
        body: JSON.stringify(contact),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error enviando solicitud");
      setContactSent(true);
      setLoading(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error enviando solicitud");
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

        {showContact ? (
          <div className="p-6">
            {contactSent ? (
              <div className="py-10 text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-400 mb-4">
                  <Check size={28} />
                </div>
                <h3 className="text-lg font-black text-white mb-2">Solicitud enviada</h3>
                <p className="text-sm text-white/60 max-w-md mx-auto">
                  Gracias — un especialista de ventas te contactará en las próximas 24 horas al email que nos diste.
                </p>
                <button
                  onClick={onClose}
                  className="mt-6 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-black uppercase tracking-widest"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-5">
                  <button
                    onClick={() => setShowContact(false)}
                    className="text-xs text-white/50 hover:text-white font-semibold"
                  >
                    ← Volver a planes
                  </button>
                </div>
                <h3 className="text-lg font-black text-white mb-1">Contactar ventas — Enterprise</h3>
                <p className="text-xs text-white/50 mb-5">
                  Cuéntanos sobre tu empresa y te contactamos con una propuesta a la medida.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest font-bold text-white/50 mb-1.5">Nombre *</label>
                    <input
                      type="text"
                      value={contact.name}
                      onChange={(e) => setContact({ ...contact, name: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
                      placeholder="Tu nombre"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest font-bold text-white/50 mb-1.5">Email *</label>
                    <input
                      type="email"
                      value={contact.email}
                      onChange={(e) => setContact({ ...contact, email: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
                      placeholder="tu@empresa.com"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] uppercase tracking-widest font-bold text-white/50 mb-1.5">Empresa *</label>
                    <input
                      type="text"
                      value={contact.company}
                      onChange={(e) => setContact({ ...contact, company: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
                      placeholder="Nombre de tu empresa"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] uppercase tracking-widest font-bold text-white/50 mb-1.5">Mensaje</label>
                    <textarea
                      value={contact.message}
                      onChange={(e) => setContact({ ...contact, message: e.target.value })}
                      rows={4}
                      className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 resize-none"
                      placeholder="Número de proyectos, usuarios, requerimientos especiales..."
                    />
                  </div>
                </div>
                {error && (
                  <div className="mt-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
                    {error}
                  </div>
                )}
                <button
                  onClick={submitContact}
                  disabled={loading !== null}
                  className="mt-5 w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading === "enterprise" ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Enviando...
                    </>
                  ) : (
                    <>
                      <Mail size={14} /> Enviar solicitud
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4 overflow-y-auto max-h-[70vh]">
            {MODAL_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-2xl border p-5 flex flex-col ${
                  plan.highlight
                    ? "border-blue-500/50 bg-blue-500/[0.04] shadow-[0_0_20px_rgba(59,130,246,0.15)]"
                    : "border-white/10 bg-white/[0.02]"
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-5 px-2 py-0.5 bg-blue-500 rounded-full text-[9px] font-black uppercase tracking-widest text-white">
                    Recomendado
                  </div>
                )}
                <h3 className="text-lg font-black text-white">{tp(`${plan.id}.name`)}</h3>
                <p className="text-[11px] text-white/40 mt-0.5">{tp(`${plan.id}.tagline`)}</p>
                <div className="mt-3 mb-4">
                  <span className="text-2xl font-black text-white">
                    {plan.priceAmount === null ? tp("priceCustom") : plan.priceDisplay}
                  </span>
                  {plan.priceAmount !== null && (
                    <span className="text-xs text-white/40 ml-1">{tp("priceSuffix")}</span>
                  )}
                </div>
                <ul className="space-y-2 mb-5 flex-1">
                  {(tp.raw(`${plan.id}.features`) as string[]).map((h) => (
                    <li key={h} className="flex items-start gap-2 text-xs text-white/70">
                      <Check size={14} className="text-blue-400 shrink-0 mt-0.5" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => (plan.cta === "contact" ? setShowContact(true) : startCheckout(plan.id))}
                  disabled={loading !== null}
                  className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                    plan.highlight
                      ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                      : "bg-white/10 hover:bg-white/15 text-white"
                  } disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                >
                  {loading === plan.id ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Cargando...
                    </>
                  ) : plan.cta === "contact" ? (
                    "Contactar ventas"
                  ) : (
                    "Elegir plan"
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        {!showContact && error && (
          <div className="mx-6 mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
            {error}
          </div>
        )}

        {!showContact && (
          <div className="px-6 pb-6 text-center">
            <p className="text-[11px] text-white/40">
              Pago seguro vía Stripe. Cancela cuando quieras desde el portal de billing.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
