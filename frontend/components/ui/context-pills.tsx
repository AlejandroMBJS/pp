"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Folder, Wrench, AlertTriangle } from "lucide-react";

type Project = { id: string; name: string };
type Task = { id: string; title: string; status: string; progress_percent: number };

export function ProjectPill({
  projects,
  selectedProjectId,
  onSelect,
}: {
  projects: Project[];
  selectedProjectId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const current = projects.find((p) => p.id === selectedProjectId);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (projects.length === 0) return null;

  return (
    <div ref={ref} className="context-pill-wrap">
      <button type="button" className="context-pill" onClick={() => setOpen((v) => !v)} title={current?.name ?? "Select project"}>
        <Folder size={13} className="text-white/55" />
        <span className="context-pill-label">{current?.name ?? "Select project"}</span>
        <ChevronDown size={12} className={`context-pill-chevron ${open ? "open" : ""}`} />
      </button>
      {open && (
        <div className="context-pill-menu" role="listbox">
          <div className="context-pill-menu-eyebrow">Projects</div>
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`context-pill-menu-item ${p.id === selectedProjectId ? "active" : ""}`}
              onClick={() => { onSelect(p.id); setOpen(false); }}
            >
              <Folder size={12} className="text-white/40" />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TaskPill({
  tasks,
  selectedTaskId,
  onSelect,
  required = false,
}: {
  tasks: Task[];
  selectedTaskId: string;
  onSelect: (id: string) => void;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const current = tasks.find((t) => t.id === selectedTaskId);
  const missing = required && !current;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Auto-open the dropdown the first time the pill mounts in "missing required" state,
  // so users land directly on the picker. Run once per mount.
  useEffect(() => {
    if (missing && tasks.length > 0) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (tasks.length === 0) {
    return (
      <div className="context-pill" title="No tasks available">
        <Wrench size={13} className="text-white/40" />
        <span className="context-pill-label text-white/40">No tasks</span>
      </div>
    );
  }

  return (
    <div ref={ref} className="context-pill-wrap">
      <button
        type="button"
        className={`context-pill ${missing ? "context-pill-warn" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title={current?.title ?? "Select a task"}
      >
        {missing ? (
          <AlertTriangle size={13} style={{ color: "#f59e0b" }} />
        ) : (
          <Wrench size={13} className="text-white/55" />
        )}
        <span className="context-pill-label">
          {current?.title ?? "Select a task"}
        </span>
        <ChevronDown size={12} className={`context-pill-chevron ${open ? "open" : ""}`} />
      </button>
      {open && (
        <div className="context-pill-menu" role="listbox">
          <div className="context-pill-menu-eyebrow">Tasks</div>
          {tasks.map((t) => {
            const dot =
              t.status === "completed" ? "#10b981" : t.status === "in_progress" ? "#3b82f6" : "#9ca3af";
            return (
              <button
                key={t.id}
                type="button"
                className={`context-pill-menu-item ${t.id === selectedTaskId ? "active" : ""}`}
                onClick={() => { onSelect(t.id); setOpen(false); }}
              >
                <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />
                <span className="truncate flex-1">{t.title}</span>
                <span className="text-[10px] text-white/40 font-bold">{t.progress_percent}%</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
