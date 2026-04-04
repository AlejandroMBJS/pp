type Accent = "green" | "amber" | "red" | "blue" | "dark";

type MetricCardProps = {
  label: string;
  value: string | number;
  accent?: Accent;
  sub?: string;
  className?: string;
};

const accentMap: Record<Accent, { bg: string; text: string; label: string }> = {
  green: { bg: "#059669", text: "white", label: "rgba(255,255,255,0.7)" },
  amber: { bg: "#d97706", text: "white", label: "rgba(255,255,255,0.7)" },
  red:   { bg: "#dc2626", text: "white", label: "rgba(255,255,255,0.7)" },
  blue:  { bg: "#2563eb", text: "white", label: "rgba(255,255,255,0.7)" },
  dark:  { bg: "#111827", text: "white", label: "rgba(255,255,255,0.6)" },
};

export function MetricCard({ label, value, accent = "dark", sub, className = "" }: MetricCardProps) {
  const style = accentMap[accent];
  return (
    <div
      className={`rounded-2xl px-6 py-6 ${className}`}
      style={{ background: style.bg, color: style.text }}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: style.label }}>
        {label}
      </div>
      <div className="mt-3 text-4xl font-extrabold tracking-tighter leading-none">{value}</div>
      {sub && <div className="mt-2 text-sm opacity-80" style={{ color: style.label }}>{sub}</div>}
    </div>
  );
}

export function MiniMetric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="glass-card p-5 border-white/5">
      <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-white/30">{sub}</div>}
    </div>
  );
}
