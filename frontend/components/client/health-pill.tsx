"use client";

import { CheckCircle2, AlertTriangle, AlertOctagon, Sparkles } from "lucide-react";

type HealthStatus = "on_track" | "at_risk" | "delayed" | "completed";

const META: Record<HealthStatus, { label: string; color: string; bg: string; border: string; Icon: typeof CheckCircle2 }> = {
  on_track: {
    label: "On track",
    color: "#10b981",
    bg: "rgba(16,185,129,0.10)",
    border: "rgba(16,185,129,0.30)",
    Icon: CheckCircle2,
  },
  at_risk: {
    label: "At risk",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.10)",
    border: "rgba(245,158,11,0.30)",
    Icon: AlertTriangle,
  },
  delayed: {
    label: "Delayed",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.10)",
    border: "rgba(239,68,68,0.30)",
    Icon: AlertOctagon,
  },
  completed: {
    label: "Completed",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.10)",
    border: "rgba(167,139,250,0.30)",
    Icon: Sparkles,
  },
};

export function HealthPill({ status }: { status?: string }) {
  const key = (status as HealthStatus) || "on_track";
  const m = META[key] ?? META.on_track;
  const Icon = m.Icon;
  return (
    <span
      className="health-pill"
      style={{ background: m.bg, color: m.color, borderColor: m.border }}
      data-status={key}
    >
      <span className="health-pill-dot" style={{ background: m.color }} />
      <Icon size={14} />
      <span className="health-pill-label">{m.label}</span>
    </span>
  );
}
