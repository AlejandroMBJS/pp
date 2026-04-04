"use client";

import type { FormEvent } from "react";
import { EmptyState } from "./ui/empty-state";
import { Input, Select } from "./ui/form-input";
import { EvidenceGallery } from "./evidence-gallery";
import { GanttTimeline } from "./gantt-timeline";
import { BudgetPanel } from "./budget-panel";
import { Loader2, TrendingUp, AlignLeft, MessageSquare, Plus } from "lucide-react";

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
  // ── Review / Approval Queue ──
  if (activeView === "review") {
    const pending = evidences.filter((e) => e.status === "pending_approval");
    const rest = evidences.filter((e) => e.status !== "pending_approval");

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

        {/* Pending approvals */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-bold uppercase tracking-widest text-white/40">
                 Pending approval
              </h2>
              {pending.length > 0 && (
                <span className="px-2 py-0.5 bg-amber-500 text-black rounded-lg text-[10px] font-black">{pending.length}</span>
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
                emptyText=""
              />
            </div>
          ) : (
            <div className="glass-card p-12 text-center border-dashed border-white/10">
              <p className="text-white/30 font-medium italic">There is no pending evidence right now.</p>
            </div>
          )}
        </div>

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
