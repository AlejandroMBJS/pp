"use client";

import { Sparkles } from "lucide-react";
import { useBilling } from "./billing-context";

type Props = { onUpgrade: () => void };

export function TrialBanner({ onUpgrade }: Props) {
  const billing = useBilling();
  if (!billing) return null;
  const sub = billing.subscription;

  // Hide for paying customers and demo (which always reads as enterprise/active).
  if (sub.status === "active" && sub.plan !== "starter") return null;

  const days = sub.days_until_trial_end;
  const isExpired = sub.status === "read_only" || sub.status === "canceled" || (sub.status === "trialing" && days <= 0);
  const isUrgent = days <= 3 && days > 0;

  if (sub.status === "trialing" && days > 5) {
    return null; // chill — no banner during early trial
  }

  const bg = isExpired
    ? "bg-red-500/10 border-red-500/30 text-red-300"
    : isUrgent
      ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
      : "bg-blue-500/10 border-blue-500/30 text-blue-300";

  const message = isExpired
    ? "Tu trial expiró. Estás en modo solo lectura."
    : days === 1
      ? "¡Último día de trial!"
      : `Tu trial termina en ${days} días`;

  return (
    <div className={`w-full px-4 py-2.5 border-b flex items-center justify-center gap-3 text-xs font-bold ${bg}`}>
      <Sparkles size={14} />
      <span>{message}</span>
      <button
        onClick={onUpgrade}
        className="ml-2 px-3 py-1 bg-white/10 hover:bg-white/20 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors"
      >
        Upgrade
      </button>
    </div>
  );
}
