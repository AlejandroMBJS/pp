"use client";

import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import type { Plan } from "@/lib/plans";

export type PlanCardTexts = {
  name: string;
  tagline: string;
  features: string[];
  ctaLabel: string;
  priceCustom: string;
  priceSuffix: string;
  badgeLabel: string;
};

type BaseProps = {
  plan: Plan;
  texts: PlanCardTexts;
  variant?: "summary" | "full";
};

type LinkProps = BaseProps & {
  ctaHref: string;
  onCta?: never;
  loading?: never;
  disabled?: never;
};

type ButtonProps = BaseProps & {
  onCta: () => void;
  ctaHref?: never;
  loading?: boolean;
  disabled?: boolean;
};

export type PlanCardProps = LinkProps | ButtonProps;

export function PlanCard(props: PlanCardProps) {
  const { plan, texts, variant = "full" } = props;
  const features =
    variant === "summary" ? texts.features.slice(0, 5) : texts.features;

  const cardClasses = `relative rounded-2xl border p-6 flex flex-col transition-all ${
    plan.highlight
      ? "border-blue-500/50 bg-gradient-to-br from-blue-500/10 to-cyan-500/[0.03] shadow-[0_0_40px_rgba(59,130,246,0.15)]"
      : "border-white/10 bg-white/[0.02] hover:border-white/20"
  }`;

  const ctaClasses = `block text-center py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
    plan.highlight
      ? "bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white shadow-lg shadow-blue-500/20"
      : "bg-white/5 hover:bg-white/10 border border-white/10 text-white"
  } disabled:opacity-50 disabled:cursor-not-allowed`;

  return (
    <div className={cardClasses}>
      {plan.highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 text-[9px] font-black uppercase tracking-widest whitespace-nowrap text-white">
          {texts.badgeLabel}
        </div>
      )}
      <h3 className="font-black text-lg text-white">{texts.name}</h3>
      <div className="mt-2 mb-3 flex items-baseline gap-1">
        <span className="text-3xl font-black text-white">
          {plan.priceAmount === null ? texts.priceCustom : plan.priceDisplay}
        </span>
        {plan.priceAmount !== null && (
          <span className="text-[11px] text-white/40">{texts.priceSuffix}</span>
        )}
      </div>
      <p className="text-[11px] text-white/50 mb-5 leading-relaxed">
        {texts.tagline}
      </p>
      <ul className="space-y-2 mb-6 flex-1 text-[11px] text-white/70">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <Check size={13} className="text-cyan-400 shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {"ctaHref" in props && props.ctaHref ? (
        <Link href={props.ctaHref} className={ctaClasses}>
          {texts.ctaLabel}
        </Link>
      ) : (
        <button
          type="button"
          onClick={props.onCta}
          disabled={props.disabled || props.loading}
          className={`${ctaClasses} flex items-center justify-center gap-2`}
        >
          {props.loading ? (
            <>
              <Loader2 size={13} className="animate-spin" /> {texts.ctaLabel}
            </>
          ) : (
            texts.ctaLabel
          )}
        </button>
      )}
    </div>
  );
}
