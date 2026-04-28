"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { EmptyState } from "./ui/empty-state";
import { EvidenceGallery, type AIFeedback } from "./evidence-gallery";
import { GanttTimeline } from "./gantt-timeline";
import { GanttZoomControl, type GanttZoomLevel } from "./ui/gantt-zoom-control";
import { BudgetPanel } from "./budget-panel";
import { Drawer } from "./ui/drawer";
import { EvidenceReviewDrawerContent } from "./supervisor/evidence-review-drawer";
import { ResubmitDeliverableModal } from "./supervisor/resubmit-deliverable-modal";
import { Loader2, TrendingUp, AlignLeft, Plus, ListChecks, Maximize2, Minimize2, X } from "lucide-react";
import { Toolbar, FilterChips, BulkBar, BulkApproveIcon, BulkRejectIcon, runBulk, type FilterChipOption } from "./ui/toolbar";
import { buildTaskColorMap } from "../lib/colors";

type Task = {
  id: string;
  project_id: string;
  title: string;
  status: string;
  start_date: string;
  end_date: string;
  progress_percent: number;
  budget_cents: number;
  spent_cents: number;
  description: string;
  assigned_to_user_id: string;
  color_hex?: string;
  client_decision_status?: string;
  client_decision_reason?: string;
  client_decision_category?: string;
  client_decision_at?: string;
  client_decision_by_name?: string;
};

type Deliverable = {
  id: string;
  task_id: string;
  title: string;
  due_date: string;
  status: string;
  client_visible: boolean;
  rejection_reason?: string;
  rejection_category?: string;
  approved_by_name?: string;
  approved_at?: string;
  approval_comment?: string;
  task_title?: string;
};

type Evidence = {
  id: string;
  task_id: string;
  file_name: string;
  url_archivo: string;
  quality_score: number;
  status: string;
  ai_processing_status: string;
  is_visible_to_client: boolean;
  created_at?: string;
  task_title?: string;
  uploader_name?: string;
  ai_feedback?: AIFeedback;
  ai_model_version?: string;
  reference_photo_url?: string;
};

type Project = {
  id: string;
  name: string;
  status: string;
  budget_total_cents: number;
  spent_total_cents: number;
};

type TimelineForm = { start_date: string; end_date: string; status: string; progress_percent: number; predecessor_task_id: string };

type SupervisorCanvasProps = {
  activeView: string;
  currentTask: Task | null;
  currentProject: Project | null;
  tasks: Task[];
  deliverables: Deliverable[];
  evidences: Evidence[];
  allEvidences: Map<string, Evidence[]>;
  timelineForm: TimelineForm;
  setTimelineForm: (f: TimelineForm) => void;
  onTimelineUpdate: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onEvidenceDecision: (id: string, action: "approve" | "reject", opts?: { reason?: string; visibleToClient?: boolean }) => Promise<void>;
  onReAudit?: (id: string) => void;
  onPollAudit?: () => Promise<void> | void;
  highlightedDeliverableId: string | null;
  onDeliverableNavigate: (deliverableId: string, taskId: string) => void;
  onTaskClick?: (taskId: string) => void;
  onEvidenceClick?: (evidence: Evidence) => void;
  loading: boolean;
  onViewChange?: (view: string) => void;
  onNewTask?: () => void;
  isMobile?: boolean;
  ganttZoom?: GanttZoomLevel;
  onGanttZoomChange?: (zoom: GanttZoomLevel) => void;
  accessToken?: string;
  onTaskTimelinePatch?: (
    taskId: string,
    patch: { start_date?: string; end_date?: string; status?: string; progress_percent?: number; predecessor_task_id?: string | null; color_hex?: string }
  ) => void;
  onResubmitDeliverable?: (deliverableId: string, note: string) => Promise<void>;
};

export function SupervisorCanvas({
  activeView,
  currentTask,
  currentProject,
  tasks,
  deliverables,
  evidences,
  allEvidences,
  timelineForm,
  setTimelineForm,
  onTimelineUpdate,
  onEvidenceDecision,
  onReAudit,
  onPollAudit,
  highlightedDeliverableId,
  onDeliverableNavigate,
  onTaskClick,
  onEvidenceClick,
  loading,
  onViewChange,
  onNewTask,
  isMobile = false,
  ganttZoom = "month",
  onGanttZoomChange,
  accessToken,
  onTaskTimelinePatch,
  onResubmitDeliverable,
}: SupervisorCanvasProps) {
  const [reviewStatusFilter, setReviewStatusFilter] = useState<"all" | "pending_approval" | "approved" | "rejected">("all");
  const [reviewTaskFilter, setReviewTaskFilter] = useState<string>("");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(() => new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState("");
  const [bulkApproveOpen, setBulkApproveOpen] = useState(false);
  const [bulkApproveVisible, setBulkApproveVisible] = useState(true);
  const [reviewDrawerId, setReviewDrawerId] = useState<string | null>(null);
  const [resubmitDeliverable, setResubmitDeliverable] = useState<Deliverable | null>(null);
  const [ganttFullscreen, setGanttFullscreen] = useState(false);

  // Exit fullscreen with Escape.
  useEffect(() => {
    if (!ganttFullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setGanttFullscreen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ganttFullscreen]);

  const taskColorByTaskId = useMemo(() => buildTaskColorMap(tasks), [tasks]);

  // Auto-poll while any evidence is queued/processing so the score/status
  // updates without the supervisor having to manually refresh.
  const hasInFlightAI = evidences.some(
    (e) => e.ai_processing_status === "queued" || e.ai_processing_status === "processing"
  );
  useEffect(() => {
    if (activeView !== "review" || !hasInFlightAI || !onPollAudit) return;
    const id = setInterval(() => { void onPollAudit(); }, 5000);
    return () => clearInterval(id);
  }, [activeView, hasInFlightAI, onPollAudit]);

  // ── Review / Approval Queue ──
  if (activeView === "review") {
    // Counts scoped to the task filter so badges match what's visible.
    const taskScoped = reviewTaskFilter
      ? evidences.filter((e) => e.task_id === reviewTaskFilter)
      : evidences;
    const filteredEvidences = taskScoped.filter((e) => {
      if (reviewStatusFilter === "all") return true;
      // Backend writes 'committed' on approval; UI label says "approved".
      if (reviewStatusFilter === "approved") return e.status === "approved" || e.status === "committed";
      return e.status === reviewStatusFilter;
    });
    const pending = filteredEvidences.filter((e) => e.status === "pending_approval");
    const rest = filteredEvidences.filter((e) => e.status !== "pending_approval");

    const statusCounts = {
      all: taskScoped.length,
      pending_approval: taskScoped.filter((e) => e.status === "pending_approval").length,
      approved: taskScoped.filter((e) => ["approved", "committed"].includes(e.status)).length,
      rejected: taskScoped.filter((e) => e.status === "rejected").length,
    };
    const statusOptions: FilterChipOption<"all" | "pending_approval" | "approved" | "rejected">[] = [
      { value: "all", label: "All", count: statusCounts.all },
      { value: "pending_approval", label: "Pending", count: statusCounts.pending_approval, color: "#f59e0b" },
      { value: "approved", label: "Approved", count: statusCounts.approved, color: "#10b981" },
      { value: "rejected", label: "Rejected", count: statusCounts.rejected, color: "#ef4444" },
    ];

    const tasksWithEvidence = tasks.filter((t) => evidences.some((e) => e.task_id === t.id));

    const selectablePending = pending.map((e) => e.id);
    const allSelected = selectablePending.length > 0 && selectablePending.every((id) => bulkSelected.has(id));
    function toggleOne(id: string) {
      setBulkSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
    function toggleAll() {
      if (allSelected) setBulkSelected(new Set());
      else setBulkSelected(new Set(selectablePending));
    }
    function clearBulk() {
      setBulkSelected(new Set());
      setBulkMode(false);
    }
    async function runBulkDecision(action: "approve" | "reject", opts?: { reason?: string; visibleToClient?: boolean }) {
      const ids = Array.from(bulkSelected);
      if (ids.length === 0) return;
      setBulkRunning(true);
      const { succeeded, failed } = await runBulk(ids, (id) => onEvidenceDecision(id, action, opts));
      setBulkRunning(false);
      setBulkSelected(new Set());
      setBulkRejectOpen(false);
      setBulkApproveOpen(false);
      setBulkRejectReason("");
      if (failed === 0) {
        toast.success(`${succeeded} evidencia${succeeded === 1 ? "" : "s"} ${action === "approve" ? "aprobada" : "rechazada"}${succeeded === 1 ? "" : "s"}`);
      } else {
        toast.error(`${succeeded} OK, ${failed} fallaron`);
      }
    }

    return (
      <div className={`space-y-8 animate-fade-in ${isMobile ? 'pb-20' : ''}`}>
        <div className={`${isMobile ? 'flex-col items-start gap-3' : 'flex items-center justify-between'} mb-6 pb-6 border-b border-white/5`}>
          <div>
            <h1 className={`${isMobile ? 'text-xl' : 'text-3xl'} font-black text-white tracking-tight uppercase`}>Review Queue</h1>
            <p className="mt-1 text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] max-w-2xl">
              {isMobile ? `${pending.length} pending` : 'Operations supervision · Evidence validation · Engine V3.0'}
            </p>
          </div>
          {!isMobile && (
            <button
              onClick={onNewTask}
              className="px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white transition-all flex items-center gap-3 group active:scale-95"
              style={{ boxShadow: "0 0 20px color-mix(in srgb, var(--accent-blue) 30%, transparent)" }}
            >
              <Plus size={18} className="group-hover:rotate-90 transition-transform duration-300" />
              <span className="text-[10px] font-black uppercase tracking-widest">New Task</span>
            </button>
          )}
        </div>

        {/* Client decisions banner — surfaces deliverables the client just
            approved or asked to change so the supervisor sees the cascade
            without needing to dig into the Gantt. */}
        {(() => {
          const clientRejected = deliverables.filter((d) => d.client_visible && d.status === "rejected");
          const clientApproved = deliverables.filter((d) => d.client_visible && d.status === "approved" && d.approved_at);
          if (clientRejected.length === 0 && clientApproved.length === 0) return null;
          // Sort approved by approved_at desc, take the most recent 3 to keep the
          // banner short. Rejected always show in full.
          const recentApproved = [...clientApproved]
            .sort((a, b) => (b.approved_at ?? "").localeCompare(a.approved_at ?? ""))
            .slice(0, 3);
          return (
            <div className="space-y-3">
              {clientRejected.length > 0 && (
                <div className="rounded-2xl border px-5 py-4" style={{ background: "color-mix(in srgb, #f59e0b 8%, transparent)", borderColor: "color-mix(in srgb, #f59e0b 35%, transparent)" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base">↺</span>
                    <h2 className="text-sm font-black uppercase tracking-widest" style={{ color: "#f59e0b" }}>
                      Cliente pidió cambios ({clientRejected.length})
                    </h2>
                  </div>
                  <div className="space-y-2">
                    {clientRejected.map((d) => (
                      <div
                        key={d.id}
                        className="rounded-xl bg-white/3 border border-white/8 px-4 py-3"
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => { if (d.task_id) onTaskClick?.(d.task_id); }}
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <div className="font-bold text-white truncate">{d.title}</div>
                            {d.task_title && (
                              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 flex-shrink-0">
                                {d.task_title}
                              </span>
                            )}
                          </div>
                          {d.rejection_reason && (
                            <div className="text-xs text-white/75 mt-1 whitespace-pre-wrap">{d.rejection_reason}</div>
                          )}
                          {d.rejection_category && (
                            <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
                              {d.rejection_category.replace(/_/g, " ")}
                            </span>
                          )}
                        </button>
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition"
                            style={{ background: "color-mix(in srgb, #10b981 22%, transparent)", color: "#10b981", border: "1px solid color-mix(in srgb, #10b981 40%, transparent)" }}
                            onClick={() => setResubmitDeliverable(d)}
                          >
                            ↻ Resolved · re-submit
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white/70 transition"
                            onClick={() => { if (d.task_id) onTaskClick?.(d.task_id); }}
                          >
                            Add evidence
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {recentApproved.length > 0 && (
                <div className="rounded-2xl border px-5 py-4" style={{ background: "color-mix(in srgb, #10b981 8%, transparent)", borderColor: "color-mix(in srgb, #10b981 30%, transparent)" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base">✓</span>
                    <h2 className="text-sm font-black uppercase tracking-widest" style={{ color: "#10b981" }}>
                      Cliente aprobó recientemente ({clientApproved.length})
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {recentApproved.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        className="text-left rounded-xl bg-white/3 hover:bg-white/5 border border-white/8 px-3 py-2 transition"
                        onClick={() => { if (d.task_id) onTaskClick?.(d.task_id); }}
                      >
                        <div className="text-sm font-semibold text-white truncate">{d.title}</div>
                        {d.approved_by_name && (
                          <div className="text-[10px] text-white/45 mt-0.5">por {d.approved_by_name}</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Operational Shortcuts - hide on mobile to focus on review */}
        {!isMobile && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => onViewChange?.("journal")}
              className="glass-card p-4 flex items-center gap-4 border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-all text-left group"
            >
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 group-hover:scale-110 transition-transform">
                <AlignLeft className="text-amber-400" size={20} />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-white/30">Quick Access</div>
                <div className="text-sm font-bold text-white tracking-tight">Project Log</div>
              </div>
            </button>
            <button 
              onClick={() => onViewChange?.("finances")}
              className="glass-card p-4 flex items-center gap-4 border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-all text-left group"
            >
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 group-hover:scale-110 transition-transform">
                <TrendingUp className="text-blue-400" size={20} />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-white/30">Management</div>
                <div className="text-sm font-bold text-white tracking-tight">Expense Report</div>
              </div>
            </button>
          </div>
        )}

        {/* Timeline form */}
        {currentTask && (
          <div className="glass-card p-0 overflow-hidden border-white/5">
            <div className="p-6 border-b border-white/5 bg-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
                  <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white uppercase tracking-widest">{currentTask.title}</h2>
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-tighter mt-0.5">Task Control</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/20">
                Active Task
              </span>
            </div>
            
            <form onSubmit={onTimelineUpdate} className="p-8 grid gap-6 md:grid-cols-4">
              <div className="md:col-span-1 space-y-1.5">
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Start</label>
                <input
                  type="date"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono"
                  value={timelineForm.start_date}
                  onChange={(e) => setTimelineForm({ ...timelineForm, start_date: e.target.value })}
                />
              </div>
              <div className="md:col-span-1 space-y-1.5">
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">End</label>
                <input
                  type="date"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono"
                  value={timelineForm.end_date}
                  onChange={(e) => setTimelineForm({ ...timelineForm, end_date: e.target.value })}
                />
              </div>
              <div className="md:col-span-1 space-y-1.5">
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Status</label>
                <select
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none"
                  value={timelineForm.status}
                  onChange={(e) => setTimelineForm({ ...timelineForm, status: e.target.value })}
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="md:col-span-1 space-y-1.5">
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Progress (%)</label>
                <input
                  type="number"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-black text-center"
                  value={String(timelineForm.progress_percent)}
                  onChange={(e) => {
                    const n = Math.min(100, Math.max(0, Number(e.target.value)));
                    setTimelineForm({ ...timelineForm, progress_percent: n });
                  }}
                />
              </div>
              <div className="md:col-span-1 space-y-1.5">
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Predecessor</label>
                <select
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none"
                  value={timelineForm.predecessor_task_id}
                  onChange={(e) => setTimelineForm({ ...timelineForm, predecessor_task_id: e.target.value })}
                >
                  <option value="">None</option>
                  {tasks.filter(t => t.id !== currentTask.id).map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </div>
              <button
                className="btn-glass md:col-span-1 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-base shadow-xl shadow-blue-500/20 disabled:opacity-30 transition-all active:scale-[0.99] flex items-center justify-center gap-3 mt-2"
                disabled={loading || timelineForm.progress_percent < 0 || timelineForm.progress_percent > 100}
              >
                {loading ? <><Loader2 size={18} className="animate-spin" /> Processing...</> : "Update Task Status"}
              </button>
            </form>
          </div>
        )}

        {/* Toolbar: filter + bulk toggle */}
        {evidences.length > 0 && (
          <Toolbar className="flex-col sm:flex-row items-start sm:items-center">
            <FilterChips
              options={statusOptions}
              value={reviewStatusFilter}
              onChange={setReviewStatusFilter}
            />
            {tasksWithEvidence.length > 1 && (
              <select
                value={reviewTaskFilter}
                onChange={(e) => setReviewTaskFilter(e.target.value)}
                className="rounded-xl bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500/50"
              >
                <option value="" style={{ background: "rgb(15 23 42)" }}>All tasks</option>
                {tasksWithEvidence.map((t) => (
                  <option key={t.id} value={t.id} style={{ background: "rgb(15 23 42)" }}>
                    {t.title}
                  </option>
                ))}
              </select>
            )}
            <div className="flex-1" />
            {statusCounts.pending_approval > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (bulkMode) clearBulk();
                  else setBulkMode(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors"
                style={{
                  background: bulkMode ? "color-mix(in srgb, var(--accent-blue) 15%, transparent)" : "rgba(255,255,255,0.04)",
                  color: bulkMode ? "var(--accent-blue)" : "rgba(255,255,255,0.5)",
                  border: `1px solid ${bulkMode ? "color-mix(in srgb, var(--accent-blue) 30%, transparent)" : "rgba(255,255,255,0.08)"}`,
                }}
              >
                <ListChecks size={12} />
                {bulkMode ? "Exit bulk" : "Bulk select"}
              </button>
            )}
          </Toolbar>
        )}

        {/* Bulk action bar */}
        {bulkMode && (
          <BulkBar
            count={bulkSelected.size}
            onClear={() => setBulkSelected(new Set())}
            actions={[
              {
                id: "approve",
                label: `Approve ${bulkSelected.size || ""}`.trim(),
                color: "green",
                icon: <BulkApproveIcon size={12} />,
                disabled: bulkRunning || bulkSelected.size === 0,
                onRun: () => setBulkApproveOpen(true),
              },
              {
                id: "reject",
                label: `Reject ${bulkSelected.size || ""}`.trim(),
                color: "red",
                icon: <BulkRejectIcon size={12} />,
                disabled: bulkRunning || bulkSelected.size === 0,
                onRun: () => setBulkRejectOpen(true),
              },
            ]}
          />
        )}

        {/* Bulk approve modal */}
        {bulkApproveOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setBulkApproveOpen(false)}>
            <div className="glass-card w-full max-w-md mx-4 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-black text-white">Aprobar {bulkSelected.size} evidencias</h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkApproveVisible}
                  onChange={(e) => setBulkApproveVisible(e.target.checked)}
                  className="accent-blue-500"
                />
                <span className="text-sm text-white/80">Visibles para el cliente</span>
              </label>
              <p className="text-xs text-white/40">Las evidencias con IA ya completada conservarán su score. Las demás serán auditadas.</p>
              <div className="flex gap-2 justify-end pt-2">
                <button className="px-4 py-2 rounded-xl border border-white/10 text-white/60 hover:bg-white/5 text-sm font-bold" onClick={() => setBulkApproveOpen(false)}>
                  Cancelar
                </button>
                <button
                  className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-bold disabled:opacity-50"
                  onClick={() => runBulkDecision("approve", { visibleToClient: bulkApproveVisible })}
                  disabled={bulkRunning}
                >
                  Aprobar {bulkSelected.size}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk reject modal */}
        {bulkRejectOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setBulkRejectOpen(false)}>
            <div className="glass-card w-full max-w-md mx-4 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-black text-white">Rechazar {bulkSelected.size} evidencias</h3>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/50">Motivo del rechazo</label>
                <textarea
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-red-500/50"
                  rows={3}
                  placeholder="Ej. Foto desenfocada, no coincide con el render, etc."
                  value={bulkRejectReason}
                  onChange={(e) => setBulkRejectReason(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button className="px-4 py-2 rounded-xl border border-white/10 text-white/60 hover:bg-white/5 text-sm font-bold" onClick={() => setBulkRejectOpen(false)}>
                  Cancelar
                </button>
                <button
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold disabled:opacity-50"
                  onClick={() => runBulkDecision("reject", { reason: bulkRejectReason.trim() || "Rechazo en lote" })}
                  disabled={bulkRunning}
                >
                  Rechazar {bulkSelected.size}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pending approvals */}
        {reviewStatusFilter !== "approved" && reviewStatusFilter !== "rejected" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-bold uppercase tracking-widest text-white/40">
                   Pending approval
                </h2>
                {pending.length > 0 && (
                  <span className="px-2 py-0.5 bg-amber-500 text-black rounded-lg text-[10px] font-black">{pending.length}</span>
                )}
                {bulkMode && pending.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-[10px] font-bold uppercase tracking-wider text-blue-400 hover:text-blue-300"
                  >
                    {allSelected ? "Deselect all" : "Select all"}
                  </button>
                )}
              </div>
              <div className="h-px flex-1 bg-white/5 mx-4" />
            </div>

            {pending.length > 0 ? (
              <div className="glass-card p-6 border-white/5">
                <EvidenceGallery
                  evidences={pending}
                  showActions
                  onApprove={(id) => onEvidenceDecision(id, "approve")}
                  onReject={(id) => onEvidenceDecision(id, "reject")}
                  onReAudit={onReAudit}
                  bulkSelected={bulkMode ? bulkSelected : undefined}
                  onToggleBulk={bulkMode ? toggleOne : undefined}
                  isMobile={isMobile}
                  taskColorByTaskId={taskColorByTaskId}
                  emptyText=""
                  onItemClick={bulkMode ? undefined : (e) => setReviewDrawerId(e.id)}
                />
              </div>
            ) : (
              <div className="glass-card p-12 text-center border-dashed border-white/10 space-y-4">
                <p className="text-white/30 font-medium italic">
                  {evidences.length === 0
                    ? "There is no pending evidence right now."
                    : "No pending evidence matches the current filter."}
                </p>
                {/* F19: nudge supervisor toward the next action when the
                    queue is empty. Both branches lead somewhere useful. */}
                {evidences.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => onViewChange?.("timeline")}
                    className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300"
                  >
                    Go to timeline → assign tasks
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setReviewStatusFilter("all"); setReviewTaskFilter(""); }}
                    className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Processed evidence */}
        {rest.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest text-white/40">
                 Processed History
              </h2>
              <div className="h-px flex-1 bg-white/5 mx-4" />
            </div>
            <div className="glass-card p-6 border-white/5 bg-white/[0.02]">
              <EvidenceGallery
                evidences={rest}
                onReAudit={onReAudit}
                isMobile={isMobile}
                emptyText=""
                taskColorByTaskId={taskColorByTaskId}
                onItemClick={(e) => setReviewDrawerId(e.id)}
              />
            </div>
          </div>
        )}

        {/* Review drawer — opens when a card is clicked (single-item review). */}
        <Drawer
          open={!!reviewDrawerId}
          onClose={() => setReviewDrawerId(null)}
          title={(() => {
            const ev = evidences.find((e) => e.id === reviewDrawerId);
            return ev?.task_title || ev?.file_name || "Evidence review";
          })()}
          subtitle="Review evidence"
          width={isMobile ? 9999 : 520}
        >
          <EvidenceReviewDrawerContent
            evidence={evidences.find((e) => e.id === reviewDrawerId) ?? null}
            accessToken={accessToken}
            onApprove={async (id) => { await onEvidenceDecision(id, "approve"); setReviewDrawerId(null); }}
            onReject={async (id, reason) => { await onEvidenceDecision(id, "reject", { reason }); setReviewDrawerId(null); }}
            onReAudit={onReAudit ? async (id) => { await onReAudit(id); } : undefined}
          />
        </Drawer>

        <ResubmitDeliverableModal
          deliverable={resubmitDeliverable}
          onClose={() => setResubmitDeliverable(null)}
          onSubmit={async (id, note) => {
            if (onResubmitDeliverable) await onResubmitDeliverable(id, note);
          }}
        />
      </div>
    );
  }

  // ── Timeline / Gantt ──
  if (activeView === "timeline") {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="executive-header">
          <h1 className="text-3xl font-black text-white tracking-tight">Project Timeline</h1>
          <p className="mt-2 text-sm text-white/50 font-medium">
            Visual Gantt with tasks, deliverables, and evidence aligned over time.
          </p>
        </div>

        {currentProject && tasks.length > 0 && (
          <BudgetPanel project={currentProject} tasks={tasks} />
        )}

        {tasks.length > 0 ? (
          <div className={ganttFullscreen ? "gantt-fullscreen-wrap" : ""}>
            <div className="flex items-center justify-end mb-3 gap-2">
              {onGanttZoomChange && (
                <GanttZoomControl value={ganttZoom} onChange={onGanttZoomChange} />
              )}
              <button
                type="button"
                className="gantt-fullscreen-btn"
                onClick={() => setGanttFullscreen((v) => !v)}
                title={ganttFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen — easier to click short tasks"}
                aria-label={ganttFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                {ganttFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </div>
            <GanttTimeline
              tasks={tasks}
              deliverables={deliverables}
              allEvidences={allEvidences}
              highlightDeliverableId={highlightedDeliverableId}
              onDeliverableClick={onDeliverableNavigate}
              onTaskClick={onTaskClick}
              onEvidenceClick={onEvidenceClick as ((e: { id: string }) => void) | undefined}
              zoomLevel={ganttZoom}
              accessToken={accessToken}
              onTaskTimelinePatch={onTaskTimelinePatch}
            />
          </div>
        ) : (
          <EmptyState text="No tasks in this project. Select a project that has tasks." />
        )}
      </div>
    );
  }

  return null;
}
