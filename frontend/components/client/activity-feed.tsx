"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Camera, Activity } from "lucide-react";

type ActivityEvent = {
  id: string;
  type: "deliverable_approved" | "deliverable_rejected" | "evidence_uploaded" | string;
  occurred_at: string;
  actor_name?: string;
  title: string;
  subtitle?: string;
  task_id?: string;
};

type Props = {
  projectId: string;
  apiBase?: string;
  accessToken?: string;
  refreshKey?: number;
};

function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

function eventMeta(type: string) {
  switch (type) {
    case "deliverable_approved":
      return { Icon: CheckCircle2, color: "#10b981", verb: "Approved" };
    case "deliverable_rejected":
      return { Icon: AlertCircle, color: "#ef4444", verb: "Requested changes on" };
    case "evidence_uploaded":
      return { Icon: Camera, color: "var(--accent-blue)", verb: "Uploaded" };
    default:
      return { Icon: Activity, color: "rgba(255,255,255,0.6)", verb: "Updated" };
  }
}

export function ActivityFeed({ projectId, apiBase = "", accessToken, refreshKey = 0 }: Props) {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!projectId) return;
      try {
        const res = await fetch(`${apiBase}/api/v1/client/projects/${projectId}/activity?limit=20`, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ActivityEvent[];
        if (!cancelled) {
          setEvents(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message || "load failed");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [projectId, apiBase, accessToken, refreshKey]);

  if (error) {
    return null; // Silent fail — feed is non-critical.
  }

  if (events === null) {
    return (
      <div className="activity-feed-skeleton">
        <div className="activity-feed-row" />
        <div className="activity-feed-row" />
        <div className="activity-feed-row" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="activity-feed-empty">
        Activity will appear here as your project progresses.
      </div>
    );
  }

  return (
    <ol className="activity-feed">
      {events.map((ev) => {
        const m = eventMeta(ev.type);
        const Icon = m.Icon;
        return (
          <li key={ev.id} className="activity-feed-item">
            <span
              className="activity-feed-dot"
              style={{ background: `color-mix(in srgb, ${m.color} 15%, transparent)`, color: m.color }}
            >
              <Icon size={14} />
            </span>
            <div className="activity-feed-body">
              <div className="activity-feed-title">
                <span className="text-white/85">
                  {ev.actor_name ? <strong className="text-white">{ev.actor_name}</strong> : <span className="text-white/70">El equipo</span>}
                </span>
                <span className="text-white/50"> · {m.verb} </span>
                <span className="text-white">{ev.title}</span>
              </div>
              {ev.subtitle && (
                <div className="activity-feed-subtitle">{ev.subtitle}</div>
              )}
              <div className="activity-feed-time">{relativeTime(ev.occurred_at)}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
