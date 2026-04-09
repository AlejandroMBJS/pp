"use client";

import { Lock } from "lucide-react";
import { type ReactNode } from "react";
import { useFeature } from "./billing-context";

type Props = {
  feature: string;
  children: ReactNode;
  onUpgrade?: () => void;
  label?: string;
};

export function Paywall({ feature, children, onUpgrade, label }: Props) {
  const allowed = useFeature(feature);
  if (allowed) return <>{children}</>;
  return (
    <div className="relative">
      <div className="pointer-events-none blur-sm opacity-40">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-slate-900/95 border border-white/10 rounded-2xl p-6 max-w-sm text-center shadow-2xl backdrop-blur-md">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 mb-3">
            <Lock size={22} />
          </div>
          <h3 className="text-sm font-black text-white uppercase tracking-widest mb-1">Función bloqueada</h3>
          <p className="text-xs text-white/60 mb-4">{label ?? "Esta función requiere un plan superior."}</p>
          {onUpgrade && (
            <button
              onClick={onUpgrade}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-[11px] font-black uppercase tracking-widest text-white transition-colors"
            >
              Ver planes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
