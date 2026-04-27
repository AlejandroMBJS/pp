"use client";

import { Search, X, ArrowUpDown, Download, Loader2, CheckCheck, XCircle } from "lucide-react";
import { useState, type ReactNode } from "react";

type ToolbarProps = {
  children: ReactNode;
  className?: string;
};

export function Toolbar({ children, className = "" }: ToolbarProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-2xl p-3 ${className}`}
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {children}
    </div>
  );
}

type SearchInputProps = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
};

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className = "",
}: SearchInputProps) {
  return (
    <div
      className={`relative flex items-center flex-1 min-w-[180px] ${className}`}
    >
      <Search
        size={14}
        className="absolute left-3 text-white/30 pointer-events-none"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-8 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 p-1 rounded-md text-white/40 hover:text-white hover:bg-white/5"
          aria-label="Clear search"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export type FilterChipOption<T extends string = string> = {
  value: T;
  label: string;
  count?: number;
  color?: string;
};

type FilterChipsProps<T extends string = string> = {
  options: FilterChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
};

export function FilterChips<T extends string = string>({
  options,
  value,
  onChange,
  className = "",
}: FilterChipsProps<T>) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {options.map((opt) => {
        const active = value === opt.value;
        const color = opt.color ?? "#3b82f6";
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
            style={{
              background: active ? `${color}22` : "rgba(255,255,255,0.04)",
              color: active ? color : "rgba(255,255,255,0.5)",
              border: `1px solid ${active ? `${color}55` : "rgba(255,255,255,0.08)"}`,
            }}
          >
            {opt.label}
            {typeof opt.count === "number" && (
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-black"
                style={{
                  background: active ? `${color}33` : "rgba(255,255,255,0.06)",
                }}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export type SortOption<T extends string = string> = {
  value: T;
  label: string;
};

type SortMenuProps<T extends string = string> = {
  options: SortOption<T>[];
  value: T;
  onChange: (v: T) => void;
};

export function SortMenu<T extends string = string>({
  options,
  value,
  onChange,
}: SortMenuProps<T>) {
  return (
    <div className="relative flex items-center gap-1.5">
      <ArrowUpDown size={12} className="text-white/40" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded-xl bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500/50"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} style={{ background: "#0f172a" }}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

type DateRangeInputsProps = {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
};

export function DateRangeInputs({
  from,
  to,
  onFromChange,
  onToChange,
}: DateRangeInputsProps) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="date"
        value={from}
        onChange={(e) => onFromChange(e.target.value)}
        className="rounded-xl bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500/50"
        aria-label="From date"
      />
      <span className="text-white/30 text-xs">→</span>
      <input
        type="date"
        value={to}
        onChange={(e) => onToChange(e.target.value)}
        className="rounded-xl bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500/50"
        aria-label="To date"
      />
      {(from || to) && (
        <button
          type="button"
          onClick={() => {
            onFromChange("");
            onToChange("");
          }}
          className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/5"
          aria-label="Clear date range"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

type ExportButtonProps = {
  onExport: () => Promise<void> | void;
  label?: string;
  disabled?: boolean;
};

export function ExportButton({
  onExport,
  label = "Export CSV",
  disabled = false,
}: ExportButtonProps) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy || disabled) return;
    setBusy(true);
    try {
      await onExport();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy || disabled}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: "rgba(16,185,129,0.1)",
        color: "#10b981",
        border: "1px solid rgba(16,185,129,0.2)",
      }}
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
      {label}
    </button>
  );
}

export type BulkAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  color?: "blue" | "green" | "red" | "amber";
  onRun: () => void | Promise<void>;
  disabled?: boolean;
};

type BulkBarProps = {
  count: number;
  actions: BulkAction[];
  onClear: () => void;
};

export function BulkBar({ count, actions, onClear }: BulkBarProps) {
  if (count === 0) return null;
  return (
    <div
      className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-2xl px-4 py-2.5 shadow-xl"
      style={{
        background: "color-mix(in srgb, var(--accent-blue) 15%, transparent)",
        border: "1px solid color-mix(in srgb, var(--accent-blue) 30%, transparent)",
        backdropFilter: "blur(12px)",
      }}
    >
      <span className="text-xs font-bold text-white">
        {count} selected
      </span>
      <button
        type="button"
        onClick={onClear}
        className="text-[10px] font-bold uppercase tracking-wider text-white/50 hover:text-white"
      >
        Clear
      </button>
      <div className="flex-1" />
      {actions.map((a) => {
        const colors = {
          blue: {
            bg: "color-mix(in srgb, var(--accent-blue) 20%, transparent)",
            fg: "var(--accent-blue)",
            border: "color-mix(in srgb, var(--accent-blue) 40%, transparent)",
          },
          green: { bg: "rgba(16,185,129,0.2)", fg: "#34d399", border: "rgba(16,185,129,0.4)" },
          red: { bg: "rgba(239,68,68,0.2)", fg: "#f87171", border: "rgba(239,68,68,0.4)" },
          amber: { bg: "rgba(245,158,11,0.2)", fg: "#fbbf24", border: "rgba(245,158,11,0.4)" },
        }[a.color ?? "blue"];
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => void a.onRun()}
            disabled={a.disabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: colors.bg,
              color: colors.fg,
              border: `1px solid ${colors.border}`,
            }}
          >
            {a.icon}
            {a.label}
          </button>
        );
      })}
    </div>
  );
}

// Convenience icons for bulk bar consumers
export { CheckCheck as BulkApproveIcon, XCircle as BulkRejectIcon };

// Helper: run many per-item operations tolerantly and report summary.
export async function runBulk<T>(
  items: T[],
  fn: (item: T) => Promise<unknown>
): Promise<{ succeeded: number; failed: number }> {
  const results = await Promise.allSettled(items.map((it) => fn(it)));
  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  return { succeeded, failed: results.length - succeeded };
}

// Helper: trigger a client-side CSV download.
export function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? "");
          if (s.includes(",") || s.includes('"') || s.includes("\n")) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        })
        .join(",")
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
