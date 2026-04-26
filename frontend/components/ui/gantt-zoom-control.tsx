"use client";

export type GanttZoomLevel = "day" | "week" | "month";

const OPTIONS: { value: GanttZoomLevel; label: string; hint: string }[] = [
  { value: "day", label: "Day", hint: "1" },
  { value: "week", label: "Week", hint: "2" },
  { value: "month", label: "Month", hint: "3" },
];

type Props = {
  value: GanttZoomLevel;
  onChange: (zoom: GanttZoomLevel) => void;
  className?: string;
};

export function GanttZoomControl({ value, onChange, className = "" }: Props) {
  return (
    <div
      role="group"
      aria-label="Gantt zoom"
      className={`inline-flex items-center rounded-xl bg-white/5 border border-white/10 p-0.5 ${className}`}
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            data-testid={`gantt-zoom-${opt.value}`}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            title={`${opt.label} (${opt.hint})`}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${
              active
                ? "bg-blue-600/90 text-white shadow-sm"
                : "text-white/50 hover:text-white/80 hover:bg-white/5"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
