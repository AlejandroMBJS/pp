"use client";

import { CheckCircle2, Diamond, AlertCircle } from "lucide-react";
import { useMemo } from "react";

type Deliverable = {
  id: string;
  title: string;
  due_date: string;
  status: string;
};

type Props = {
  deliverables: Deliverable[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  isMobile?: boolean;
};

function parseDate(s: string): number {
  const d = new Date(s);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function dayMs() {
  return 24 * 60 * 60 * 1000;
}

function statusMeta(status: string) {
  if (status === "approved") return { label: "Approved", color: "#10b981", glow: "rgba(16,185,129,0.45)" };
  if (status === "rejected") return { label: "Changes requested", color: "#ef4444", glow: "rgba(239,68,68,0.45)" };
  return { label: "Pending review", color: "#f59e0b", glow: "rgba(245,158,11,0.45)" };
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

export function DeliverablesTimeline({ deliverables, selectedId, onSelect, isMobile = false }: Props) {
  const now = Date.now();

  const sorted = useMemo(
    () => [...deliverables].sort((a, b) => parseDate(a.due_date) - parseDate(b.due_date)),
    [deliverables],
  );

  // Mobile: stacked card list (no horizontal positioning).
  if (isMobile) {
    return (
      <div className="deliverables-timeline-mobile">
        {sorted.map((d) => {
          const m = statusMeta(d.status);
          const overdue = d.status !== "approved" && parseDate(d.due_date) < now;
          return (
            <button
              key={d.id}
              type="button"
              className={`deliverables-timeline-card ${selectedId === d.id ? "active" : ""}`}
              onClick={() => onSelect(d.id)}
              data-status={d.status}
            >
              <div className="deliverables-timeline-card-icon" style={{ background: `color-mix(in srgb, ${m.color} 12%, transparent)`, color: m.color }}>
                {d.status === "approved" ? <CheckCircle2 size={18} /> : overdue ? <AlertCircle size={18} /> : <Diamond size={18} />}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className="deliverables-timeline-card-title">{d.title}</div>
                <div className="deliverables-timeline-card-meta">
                  <span>{fmtDate(d.due_date)}</span>
                  <span className="text-white/20">·</span>
                  <span style={{ color: m.color }}>{m.label}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  if (sorted.length === 0) {
    return null;
  }

  // Compute horizontal range.
  const firstDate = parseDate(sorted[0].due_date) || now;
  const lastDate = parseDate(sorted[sorted.length - 1].due_date) || now;
  const padding = 7 * dayMs();
  const rangeStart = Math.min(firstDate, now) - padding;
  const rangeEnd = Math.max(lastDate, now) + padding;
  const span = Math.max(rangeEnd - rangeStart, dayMs());

  const todayPct = ((now - rangeStart) / span) * 100;

  // Tooltip is per-node title attribute (cheap, accessible).
  return (
    <div className="deliverables-timeline">
      <div className="deliverables-timeline-track" data-testid="deliverables-timeline">
        {/* Today line */}
        {todayPct >= 0 && todayPct <= 100 && (
          <div className="deliverables-timeline-today" style={{ left: `${todayPct}%` }}>
            <span className="deliverables-timeline-today-label">Today</span>
          </div>
        )}

        {/* Milestones */}
        {sorted.map((d) => {
          const m = statusMeta(d.status);
          const overdue = d.status !== "approved" && parseDate(d.due_date) < now;
          const t = parseDate(d.due_date);
          const pct = ((t - rangeStart) / span) * 100;
          const Icon = d.status === "approved" ? CheckCircle2 : overdue ? AlertCircle : Diamond;
          const tooltip = `${d.title} — ${fmtDate(d.due_date)} (${m.label})`;
          return (
            <button
              key={d.id}
              type="button"
              className={`deliverables-timeline-node ${selectedId === d.id ? "active" : ""}`}
              style={{
                left: `${pct}%`,
                color: m.color,
                ["--node-color" as string]: m.color,
                ["--node-glow" as string]: m.glow,
              }}
              onClick={() => onSelect(d.id)}
              title={tooltip}
              aria-label={tooltip}
              data-status={d.status}
            >
              <span className="deliverables-timeline-node-dot">
                <Icon size={14} />
              </span>
              <span className="deliverables-timeline-node-label">{d.title}</span>
              <span className="deliverables-timeline-node-date">{fmtDate(d.due_date)}</span>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="deliverables-timeline-legend">
        <span className="deliverables-timeline-legend-item">
          <span className="deliverables-timeline-legend-dot" style={{ background: "#10b981" }} />
          Approved
        </span>
        <span className="deliverables-timeline-legend-item">
          <span className="deliverables-timeline-legend-dot" style={{ background: "#f59e0b" }} />
          Pending review
        </span>
        <span className="deliverables-timeline-legend-item">
          <span className="deliverables-timeline-legend-dot" style={{ background: "#ef4444" }} />
          Changes requested
        </span>
      </div>
    </div>
  );
}
