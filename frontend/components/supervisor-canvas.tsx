"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { EmptyState } from "./ui/empty-state";
import { Input, Select } from "./ui/form-input";
import { EvidenceGallery } from "./evidence-gallery";
import { GanttTimeline } from "./gantt-timeline";
import { BudgetPanel } from "./budget-panel";
import { Loader2, TrendingUp, AlignLeft, MessageSquare, Plus, Check, X as XIcon, ListChecks } from "lucide-react";
import { Toolbar, FilterChips, BulkBar, BulkApproveIcon, BulkRejectIcon, runBulk, type FilterChipOption } from "./ui/toolbar";

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
};

type Deliverable = {
  id: string;
  task_id: string;
  title: string;
  due_date: string;
  status: string;
  client_visible: boolean;
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
  onEvidenceDecision: (id: string, action: "approve" | "reject") => Promise<void>;
  highlightedDeliverableId: string | null;
  onDeliverableNavigate: (deliverableId: string, taskId: string) => void;
  onTaskClick?: (taskId: string) => void;
  loading: boolean;
  onViewChange?: (view: string) => void;
  onNewTask?: () => void;
  isMobile?: boolean;
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
  highlightedDeliverableId,
  onDeliverableNavigate,
  onTaskClick,
  loading,
  onViewChange,
  onNewTask,
  isMobile = false,
}: SupervisorCanvasProps) {
  const [reviewStatusFilter, setReviewStatusFilter] = useState<"all" | "pending_approval" | "approved" | "rejected">("all");
  const [reviewTaskFilter, setReviewTaskFilter] = useState<string>("");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(() => new Set());
  const [bulkRunning, setBulkRunning] = useState(false);

  // ── Review / Approval Queue ──
  if (activeView === "review") {
    const filteredEvidences = evidences.filter((e) => {
      if (reviewStatusFilter !== "all" && e.status !== reviewStatusFilter) return false;
      if (reviewTaskFilter && e.task_id !== reviewTaskFilter) return false;
      return true;
    });
    const pending = filteredEvidences.filter((e) => e.status === "pending_approval");
    const rest = filteredEvidences.filter((e) => e.status !== "pending_approval");

    const statusCounts = {
      all: evidences.length,
      pending_approval: evidences.filter((e) => e.status === "pending_approval").length,
      approved: evidences.filter((e) => e.status === "approved").length,
      rejected: evidences.filter((e) => e.status === "rejected").length,
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
    async function runBulkDecision(action: "approve" | "reject") {
      const ids = Array.from(bulkSelected);
      if (ids.length === 0) return;
      setBulkRunning(true);
      const { succeeded, failed } = await runBulk(ids, (id) => onEvidenceDecision(id, action));
      setBulkRunning(false);
      setBulkSelected(new Set());
      if (failed === 0) {
        toast.success(`${succeeded} evidence ${action === "approve" ? "approved" : "rejected"}`);
      } else {
        toast.error(`${succeeded} ${action === "approve" ? "approved" : "rejected"}, ${failed} failed`);
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
              className="px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all flex items-center gap-3 group active:scale-95"
            >
              <Plus size={18} className="group-hover:rotate-90 transition-transform duration-300" />
              <span className="text-[10px] font-black uppercase tracking-widest">New Task</span>
            </button>
          )}
        </div>

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
                  className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none"
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
                  className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none"
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
                <option value="" style={{ background: "#0f172a" }}>All tasks</option>
                {tasksWithEvidence.map((t) => (
                  <option key={t.id} value={t.id} style={{ background: "#0f172a" }}>
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
                  background: bulkMode ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.04)",
                  color: bulkMode ? "#60a5fa" : "rgba(255,255,255,0.5)",
                  border: `1px solid ${bulkMode ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.08)"}`,
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
                onRun: () => runBulkDecision("approve"),
              },
              {
                id: "reject",
                label: `Reject ${bulkSelected.size || ""}`.trim(),
                color: "red",
                icon: <BulkRejectIcon size={12} />,
                disabled: bulkRunning || bulkSelected.size === 0,
                onRun: () => runBulkDecision("reject"),
              },
            ]}
          />
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
              bulkMode ? (
                <div className="glass-card p-3 border-white/5 space-y-1.5">
                  {pending.map((ev) => {
                    const checked = bulkSelected.has(ev.id);
                    const task = tasks.find((t) => t.id === ev.task_id);
                    return (
                      <label
                        key={ev.id}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-colors hover:bg-white/5"
                        style={{ border: "1px solid rgba(255,255,255,0.06)", background: checked ? "rgba(59,130,246,0.05)" : "transparent" }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(ev.id)}
                          className="h-4 w-4 rounded border-white/20 bg-white/5 accent-blue-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-white truncate">{ev.file_name}</div>
                          <div className="text-[10px] text-white/40 mt-0.5 flex items-center gap-2">
                            <span>AI: {ev.quality_score > 0 ? `${ev.quality_score}/100` : "pending"}</span>
                            {task && (
                              <>
                                <span>·</span>
                                <span className="truncate">{task.title}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); void onEvidenceDecision(ev.id, "approve"); }}
                            className="p-1.5 rounded-lg hover:bg-green-500/20 text-green-400"
                            title="Approve"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); void onEvidenceDecision(ev.id, "reject"); }}
                            className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400"
                            title="Reject"
                          >
                            <XIcon size={14} />
                          </button>
                        </div>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="glass-card p-6 border-white/5">
                  <EvidenceGallery
                    evidences={pending}
                    showActions
                    onApprove={(id) => onEvidenceDecision(id, "approve")}
                    onReject={(id) => onEvidenceDecision(id, "reject")}
                    emptyText=""
                  />
                </div>
              )
            ) : (
              <div className="glass-card p-12 text-center border-dashed border-white/10">
                <p className="text-white/30 font-medium italic">
                  {evidences.length === 0
                    ? "There is no pending evidence right now."
                    : "No pending evidence matches the current filter."}
                </p>
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
              <EvidenceGallery evidences={rest} emptyText="" />
            </div>
          </div>
        )}
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
          <GanttTimeline
            tasks={tasks}
            deliverables={deliverables}
            allEvidences={allEvidences}
            highlightDeliverableId={highlightedDeliverableId}
            onDeliverableClick={onDeliverableNavigate}
            onTaskClick={onTaskClick}
          />
        ) : (
          <EmptyState text="No tasks in this project. Select a project that has tasks." />
        )}
      </div>
    );
  }

  return null;
}
