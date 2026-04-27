"use client";

import { X, Pencil, ChevronRight, GitBranch, Calendar, Users, Star } from "lucide-react";
import { withAccessToken } from "../lib/files";

type Task = {
  id: string;
  title: string;
  description?: string;
  status: string;
  start_date: string;
  end_date: string;
  progress_percent: number;
  budget_cents?: number;
  spent_cents?: number;
  predecessor_task_id?: string;
  assigned_to_user_id?: string;
  color_hex?: string;
};

type Deliverable = {
  id: string;
  task_id: string;
  title: string;
  due_date: string;
  status: string;
};

type Evidence = {
  id: string;
  task_id: string;
  file_name: string;
  url_archivo: string;
  quality_score: number;
  status: string;
  created_at?: string;
};

type UserLite = {
  id: string;
  full_name?: string;
  email?: string;
};

type TaskDetailsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  tasks: Task[];
  deliverables: Deliverable[];
  evidences: Evidence[];
  users?: UserLite[];
  accessToken?: string;
  onStatusChange?: (status: string) => void;
  onColorChange?: (color: string) => void;
  onOpenEditor?: () => void;
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "#9ca3af", bg: "rgba(156,163,175,0.15)" },
  in_progress: { label: "In progress", color: "#3b82f6", bg: "rgba(59,130,246,0.18)" },
  completed: { label: "Completed", color: "#10b981", bg: "rgba(16,185,129,0.18)" },
};

function money(cents: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format((cents || 0) / 100);
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export function TaskDetailsModal({
  isOpen,
  onClose,
  task,
  tasks,
  deliverables,
  evidences,
  users = [],
  accessToken,
  onStatusChange,
  onColorChange,
  onOpenEditor,
}: TaskDetailsModalProps) {
  if (!isOpen || !task) return null;

  const taskDeliverables = deliverables.filter((d) => d.task_id === task.id);
  const taskEvidences = evidences.filter((e) => e.task_id === task.id);
  const predecessor = task.predecessor_task_id
    ? tasks.find((t) => t.id === task.predecessor_task_id)
    : null;
  const successors = tasks.filter((t) => t.predecessor_task_id === task.id);
  const assignee = users.find((u) => u.id === task.assigned_to_user_id);
  const status = STATUS_META[task.status] ?? STATUS_META.pending;

  const budgetSpent = task.spent_cents ?? 0;
  const budgetTotal = task.budget_cents ?? 0;
  const budgetDelta = budgetTotal > 0 ? Math.round((budgetSpent / budgetTotal) * 100) : 0;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet" style={{ maxWidth: 720, width: "100%" }}>
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
              style={{ background: "var(--accent-gradient)" }}
            >
              <ChevronRight size={18} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-base font-bold text-white truncate" title={task.title}>
                {task.title}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <select
                  value={task.status}
                  onChange={(e) => onStatusChange?.(e.target.value)}
                  className="task-details-status-select"
                  style={{
                    background: status.bg,
                    color: status.color,
                    border: `1px solid ${status.color}40`,
                  }}
                  disabled={!onStatusChange}
                  title={onStatusChange ? "Change status" : "Read-only"}
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                </select>
                <span className="text-xs text-white/50">{task.progress_percent}% complete</span>
              </div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
          <div className="space-y-5">
            {task.description && (
              <div>
                <div className="task-details-label">Description</div>
                <div className="text-sm text-white/80 whitespace-pre-wrap">{task.description}</div>
              </div>
            )}

            {/* Quick info grid */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="task-details-label">Start</div>
                <div className="task-details-value">
                  <Calendar size={12} /> {formatDate(task.start_date)}
                </div>
              </div>
              <div>
                <div className="task-details-label">End</div>
                <div className="task-details-value">
                  <Calendar size={12} /> {formatDate(task.end_date)}
                </div>
              </div>
              <div>
                <div className="task-details-label">Progress</div>
                <div className="task-details-progress-track">
                  <div
                    className="task-details-progress-fill"
                    style={{ width: `${task.progress_percent}%` }}
                  />
                </div>
                <div className="text-xs text-white/60 mt-1">{task.progress_percent}%</div>
              </div>
              <div>
                <div className="task-details-label">Assignee</div>
                <div className="task-details-value">
                  <Users size={12} /> {assignee?.full_name || assignee?.email || "Unassigned"}
                </div>
              </div>
              {budgetTotal > 0 && (
                <>
                  <div>
                    <div className="task-details-label">Budget</div>
                    <div className="task-details-value">{money(budgetTotal)}</div>
                  </div>
                  <div>
                    <div className="task-details-label">Spent</div>
                    <div className="task-details-value" style={{ color: budgetDelta > 100 ? "#ef4444" : "#fff" }}>
                      {money(budgetSpent)} ({budgetDelta}%)
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Color picker */}
            <div>
              <div className="task-details-label">Bar &amp; row color</div>
              <div className="task-details-color-row">
                {[
                  // Default: clears override → bar uses status color.
                  "",
                  // Status colors (blue/green/amber/red) intentionally
                  // omitted — they map to in_progress/completed/pending/
                  // overdue and would confuse users.
                  "#8b5cf6", // purple
                  "#ec4899", // pink
                  "#14b8a6", // teal
                  "#6366f1", // indigo
                  "#d946ef", // fuchsia
                  "#a855f7", // violet
                  "#64748b", // slate
                ].map((c) => {
                  const active = (task.color_hex ?? "") === c;
                  return (
                    <button
                      key={c || "default"}
                      type="button"
                      className={`task-details-swatch ${active ? "active" : ""}`}
                      style={{
                        background: c || "transparent",
                        border: c
                          ? `2px solid ${active ? "#fff" : "rgba(255,255,255,0.15)"}`
                          : `2px dashed rgba(255,255,255,${active ? 0.6 : 0.25})`,
                      }}
                      onClick={() => onColorChange?.(c)}
                      disabled={!onColorChange}
                      title={c ? c : "Default (use status color)"}
                      aria-label={c ? `Set color ${c}` : "Reset to status color"}
                    />
                  );
                })}
                <label
                  className="task-details-swatch-custom"
                  title="Pick any RGB color"
                  aria-label="Pick custom RGB color"
                >
                  <input
                    type="color"
                    value={task.color_hex || "#8b5cf6"}
                    disabled={!onColorChange}
                    onChange={(e) => onColorChange?.(e.target.value)}
                  />
                  <span className="task-details-swatch-custom-icon">+</span>
                </label>
              </div>
              {task.color_hex && (
                <div className="task-details-color-current">
                  <span className="task-details-color-chip" style={{ background: task.color_hex }} />
                  <code>{task.color_hex.toUpperCase()}</code>
                </div>
              )}
            </div>

            {/* Linked tasks (predecessor + successors) */}
            {(predecessor || successors.length > 0) && (
              <div>
                <div className="task-details-section-header">Linked tasks</div>
                {predecessor && (
                  <div className="space-y-1 mb-3">
                    <div className="task-details-label">Depends on (must finish first)</div>
                    <div className="task-details-row">
                      <GitBranch size={14} className="text-blue-400" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{predecessor.title}</div>
                        <div className="text-xs text-white/40">
                          {formatDate(predecessor.start_date)} → {formatDate(predecessor.end_date)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {successors.length > 0 && (
                  <div className="space-y-1">
                    <div className="task-details-label">Blocks (waits for this one)</div>
                    {successors.map((s) => (
                      <div key={s.id} className="task-details-row">
                        <GitBranch size={14} className="text-blue-400" style={{ transform: "scaleX(-1)" }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-white truncate">{s.title}</div>
                          <div className="text-xs text-white/40">
                            {formatDate(s.start_date)} → {formatDate(s.end_date)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Deliverables */}
            {taskDeliverables.length > 0 && (
              <div>
                <div className="task-details-section-header">
                  Deliverables <span className="task-details-section-count">{taskDeliverables.length}</span>
                </div>
                <div className="space-y-2">
                  {taskDeliverables.map((d) => (
                    <div key={d.id} className="task-details-row">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{d.title}</div>
                        <div className="text-xs text-white/40">Due {formatDate(d.due_date)}</div>
                      </div>
                      <span
                        className="task-details-pill"
                        style={{
                          background: d.status === "approved" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
                          color: d.status === "approved" ? "#10b981" : "#f59e0b",
                        }}
                      >
                        {d.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Evidences */}
            {taskEvidences.length > 0 && (
              <div>
                <div className="task-details-section-header">
                  Evidences <span className="task-details-section-count">{taskEvidences.length}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {taskEvidences.map((e) => (
                    <div key={e.id} className="task-details-evidence">
                      <img
                        src={withAccessToken(e.url_archivo, accessToken)}
                        alt={e.file_name}
                        onError={(ev) => {
                          (ev.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                      <div className="task-details-evidence-meta">
                        {e.quality_score > 0 && (
                          <span className="task-details-evidence-score">
                            <Star size={10} /> {e.quality_score}
                          </span>
                        )}
                        <span className="text-[10px] text-white/60 truncate">{e.file_name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          {onOpenEditor && (
            <button type="button" className="task-details-edit-btn" onClick={onOpenEditor}>
              <Pencil size={12} /> Edit details
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
