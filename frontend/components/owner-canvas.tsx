"use client";

import { useMemo, useState } from "react";
import { TrendingUp, AlertTriangle, Activity, DollarSign, Plus, LayoutGrid, ClipboardList, Users, UserPlus, Mail, FolderKanban, ChevronRight, Cog } from "lucide-react";
import { toast } from "sonner";
import {
  Toolbar,
  SearchInput,
  FilterChips,
  SortMenu,
  ExportButton,
  downloadCSV,
} from "./ui/toolbar";
import { MetricCard } from "./ui/metric-card";
import { EmptyState } from "./ui/empty-state";
import { ListRow } from "./ui/list-row";
import { ProgressBar } from "./ui/progress-bar";
import { BudgetPanel } from "./budget-panel";
import { GanttTimeline } from "./gantt-timeline";
import { GanttZoomControl, type GanttZoomLevel } from "./ui/gantt-zoom-control";
import { EvidenceGallery } from "./evidence-gallery";
import { UsagePanel } from "./usage-panel";
import { TeamMemberDetail, type TeamProjectLite, type TeamUser } from "./team-member-detail";

type Dashboard = {
  product_name: string;
  portfolio: { active_projects: number; open_alerts: number; health_score: number; budget_variance: string };
  projects: Array<{ id: string; name: string; status: string; timeline_progress: number; budget_consumed: number; quality_score: number; deliverables_due: number }>;
};

type Project = {
  id: string;
  name: string;
  status: string;
  budget_total_cents: number;
  spent_total_cents: number;
  start_date: string;
  planned_end_date: string;
  logo_url?: string;
};

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

type UserType = { id: string; email: string; full_name: string; role: string; is_active?: boolean; email_verified?: boolean };

type OwnerCanvasProps = {
  activeView: string;
  dashboard: Dashboard | null;
  projects: Project[];
  currentProject: Project | null;
  tasks: Task[];
  deliverables: Deliverable[];
  evidences: Evidence[];
  allEvidences: Map<string, Evidence[]>;
  highlightedDeliverableId: string | null;
  onDeliverableNavigate: (deliverableId: string, taskId: string) => void;
  onEvidenceDecision: (id: string, action: "approve" | "reject") => Promise<void>;
  onTaskClick?: (taskId: string) => void;
  onEvidenceClick?: (evidence: Evidence) => void;
  onViewChange?: (view: string) => void;
  onNewProject?: () => void;
  onNewTask?: () => void;
  onInviteUser?: () => void;
  users?: UserType[];
  isMobile?: boolean;
  token?: string;
  currentUserId?: string;
  onTeamChanged?: () => void | Promise<void>;
  ganttZoom?: GanttZoomLevel;
  onGanttZoomChange?: (zoom: GanttZoomLevel) => void;
  accessToken?: string;
  onTaskTimelinePatch?: (
    taskId: string,
    patch: { start_date?: string; end_date?: string; status?: string; progress_percent?: number; predecessor_task_id?: string | null }
  ) => void;
};

function money(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format((value || 0) / 100);
}

function statusBadge(status: string) {
  switch (status) {
    case "active": case "in_progress": return "badge badge-blue";
    case "completed":                  return "badge badge-green";
    default:                           return "badge badge-gray";
  }
}

export function OwnerCanvas({
  activeView,
  dashboard,
  projects,
  currentProject,
  tasks,
  deliverables,
  evidences,
  allEvidences,
  highlightedDeliverableId,
  onDeliverableNavigate,
  onEvidenceDecision,
  onTaskClick,
  onEvidenceClick,
  onViewChange,
  onNewProject,
  onNewTask,
  onInviteUser,
  users = [],
  isMobile = false,
  token,
  currentUserId,
  onTeamChanged,
  ganttZoom = "month",
  onGanttZoomChange,
  accessToken,
  onTaskTimelinePatch,
}: OwnerCanvasProps) {
  const [selectedTeamUserId, setSelectedTeamUserId] = useState<string | null>(null);
  const canManageTeam = !!token;

  // Projects / Timeline toolbar state
  const [taskSearch, setTaskSearch] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState<"all" | "pending" | "in_progress" | "completed">("all");
  const [taskSort, setTaskSort] = useState<"end_asc" | "end_desc" | "progress_desc" | "progress_asc" | "budget_desc" | "title_asc">("end_asc");

  // Team toolbar state
  const [teamSearch, setTeamSearch] = useState("");
  const [teamRoleFilter, setTeamRoleFilter] = useState<"all" | "owner" | "supervisor" | "helper" | "client">("all");

  const filteredTasks = useMemo(() => {
    const q = taskSearch.trim().toLowerCase();
    const filtered = tasks.filter((t) => {
      if (taskStatusFilter !== "all" && t.status !== taskStatusFilter) return false;
      if (q && !t.title.toLowerCase().includes(q)) return false;
      return true;
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (taskSort) {
        case "end_asc": return (a.end_date || "").localeCompare(b.end_date || "");
        case "end_desc": return (b.end_date || "").localeCompare(a.end_date || "");
        case "progress_desc": return b.progress_percent - a.progress_percent;
        case "progress_asc": return a.progress_percent - b.progress_percent;
        case "budget_desc": return (b.budget_cents || 0) - (a.budget_cents || 0);
        case "title_asc": return a.title.localeCompare(b.title);
        default: return 0;
      }
    });
    return sorted;
  }, [tasks, taskSearch, taskStatusFilter, taskSort]);

  const filteredUsers = useMemo(() => {
    const q = teamSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (teamRoleFilter !== "all" && u.role !== teamRoleFilter) return false;
      if (q) {
        const hay = `${u.full_name ?? ""} ${u.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, teamSearch, teamRoleFilter]);

  // ── Overview ──
  if (activeView === "overview") {
    return (
      <div className={`space-y-8 animate-fadeIn ${isMobile ? 'pb-20' : ''}`}>
        <div className={`${isMobile ? 'flex-col items-start gap-4' : 'flex items-center justify-between'} mb-8 pb-6 border-b border-white/5 animate-slideInDown`}>
          <div>
            <h1 className={`${isMobile ? 'text-xl' : 'text-3xl'} font-black text-white tracking-tight uppercase`}>Command Center</h1>
            <p className="mt-1 text-xs font-bold text-white/30 uppercase tracking-[0.2em] max-w-2xl">
              Active portfolio · Real-time KPIs · Engine V3.0
            </p>
          </div>
          {!isMobile && (
            <div className="flex gap-4">
              <button 
                onClick={() => onViewChange?.("projects")}
                className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 hover:border-blue-500/30 transition-all flex items-center gap-3 group"
              >
                <LayoutGrid size={18} className="group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-black uppercase tracking-widest">View full portfolio</span>
              </button>
              <button 
                onClick={onNewProject}
                className="px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] transition-all flex items-center gap-3 group active:scale-95"
              >
                <Plus size={18} className="group-hover:rotate-90 transition-transform duration-300" />
                <span className="text-[10px] font-black uppercase tracking-widest">New project</span>
              </button>
            </div>
          )}
        </div>

        {isMobile ? (
          <div className="space-y-4">
            <div className="glass-card p-4 border-white/5">
              <div className="text-[10px] font-bold uppercase text-white/40 tracking-widest mb-1">Active Projects</div>
              <div className="text-2xl font-black text-white">{dashboard?.portfolio.active_projects ?? 0}</div>
            </div>
            <div className="glass-card p-4 border-white/5">
              <div className="text-[10px] font-bold uppercase text-white/40 tracking-widest mb-1">Open Alerts</div>
              <div className="text-2xl font-black text-amber-400">{dashboard?.portfolio.open_alerts ?? 0}</div>
            </div>
            <div className="glass-card p-4 border-white/5">
              <div className="text-[10px] font-bold uppercase text-white/40 tracking-widest mb-1">Health Score</div>
              <div className="text-2xl font-black text-green-400">{dashboard?.portfolio.health_score.toFixed(1) ?? "0"}%</div>
            </div>
            <div className="glass-card p-4 border-white/5">
              <div className="text-[10px] font-bold uppercase text-white/40 tracking-widest mb-1">Budget Variance</div>
              <div className="text-2xl font-black text-white">{dashboard?.portfolio.budget_variance ?? "0%"}</div>
            </div>
          </div>
        ) : (
          <div className="metric-grid">
            <MetricCard
              label="Active projects"
              value={dashboard?.portfolio.active_projects ?? 0}
              accent="blue"
              className="glass-card metric-card-premium"
            />
            <MetricCard
              label="Open alerts"
              value={dashboard?.portfolio.open_alerts ?? 0}
              accent="amber"
              className="glass-card metric-card-premium"
            />
            <MetricCard
              label="Health score"
              value={`${dashboard?.portfolio.health_score.toFixed(1) ?? "0"}%`}
              accent="green"
              className="glass-card metric-card-premium"
            />
            <MetricCard
              label="Variance"
              value={dashboard?.portfolio.budget_variance ?? "0%"}
              accent="dark"
              className="glass-card metric-card-premium"
            />
          </div>
        )}

        {/* Operational Quick Access */}
        <div className="space-y-5">
          <h2 className="text-xl font-bold text-white/90">Operations Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div 
              onClick={() => onViewChange?.("finances")}
              className="glass-card p-6 border-white/5 bg-white/[0.02] cursor-pointer hover:bg-white/[0.05] transition-all group overflow-hidden relative"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <DollarSign size={80} />
              </div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/20">
                  <TrendingUp className="text-blue-400" size={20} />
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">Cost Control</div>
              </div>
              <div className="text-2xl font-black text-white tracking-tight">{money(currentProject?.spent_total_cents ?? 0)}</div>
              <div className="mt-2 text-[10px] font-bold uppercase text-blue-400/60 tracking-wider">View financial details →</div>
            </div>

            <div 
              onClick={() => onViewChange?.("journal")}
              className="glass-card p-6 border-white/5 bg-white/[0.02] cursor-pointer hover:bg-white/[0.05] transition-all group overflow-hidden relative"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Activity size={80} />
              </div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center border border-amber-500/20">
                  <Activity className="text-amber-400" size={20} />
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">Latest Log</div>
              </div>
              <div className="text-sm font-bold text-white tracking-tight line-clamp-1">Active project: Standard report</div>
              <div className="mt-2 text-[10px] font-bold uppercase text-amber-400/60 tracking-wider">Open daily log →</div>
            </div>

            <div 
              onClick={() => onViewChange?.("messages")}
              className="glass-card p-6 border-white/5 bg-white/[0.02] cursor-pointer hover:bg-white/[0.05] transition-all group overflow-hidden relative"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <AlertTriangle size={80} />
              </div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-xl bg-slate-500/20 flex items-center justify-center border border-slate-500/20">
                  <AlertTriangle className="text-slate-300" size={20} />
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">RFI requests</div>
              </div>
              <div className="text-2xl font-black text-white tracking-tight">{evidences.filter(e => e.status === "pending_approval").length} Pending</div>
              <div className="mt-2 text-[10px] font-bold uppercase text-slate-300/70 tracking-wider">Open message hub →</div>
            </div>
          </div>
        </div>

        {/* Portfolio grid */}
        <div className="space-y-5 mt-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-black text-white/90 uppercase tracking-tighter flex items-center gap-3">
              <div className="h-6 w-1 bg-blue-600 rounded-full shadow-[0_0_8px_rgba(37,99,235,0.8)]" />
               Operational Portfolio
            </h2>
            <div className="flex gap-2">
              <button 
                onClick={onNewTask}
                className="px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-white/40 hover:text-white hover:border-white/20 transition-all text-[9px] font-black uppercase tracking-widest flex items-center gap-2"
              >
                 <Plus size={12} /> New task
              </button>
            </div>
          </div>
          {(dashboard?.projects ?? []).length === 0 ? (
            <EmptyState text="No active projects in the portfolio." />
          ) : (
            <div className="card-grid">
              {(dashboard?.projects ?? []).map((project) => {
                const fullProject = projects.find((p) => p.id === project.id);
                const logoUrl = fullProject?.logo_url;
                return (
                <div key={project.id} className="glass-card p-6 border-white/5 hover:border-white/20">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      {logoUrl ? (
                        <img src={logoUrl} alt="" className="h-10 w-10 rounded-xl object-cover flex-shrink-0 border border-white/10" />
                      ) : (
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
                          style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}
                        >
                          <FolderKanban size={18} className="text-white" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="text-lg font-bold text-white tracking-tight truncate">{project.name}</h3>
                        <div className="mt-1 flex gap-2">
                          <span className={statusBadge(project.status)}>{project.status}</span>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/80 border border-white/5 flex-shrink-0">
                       {project.deliverables_due} deliverables
                    </div>
                  </div>
                  <div className="mt-6 space-y-4">
                    <div>
                      <div className="mb-2 flex justify-between text-[11px] font-medium text-white/40 uppercase tracking-wide">
                        <span>Timeline</span>
                        <span className="text-white/80">{project.timeline_progress}%</span>
                      </div>
                      <ProgressBar value={project.timeline_progress} size="sm" color="blue" />
                    </div>
                    <div>
                      <div className="mb-2 flex justify-between text-[11px] font-medium text-white/40 uppercase tracking-wide">
                         <span>Budget</span>
                        <span className="text-white/80">{project.budget_consumed}%</span>
                      </div>
                      <ProgressBar value={project.budget_consumed} size="sm" color="amber" />
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <span className="text-xs text-white/40 font-medium uppercase tracking-wider">Calidad IA</span>
                      <span className="text-sm font-bold text-white">{project.quality_score}%</span>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>

        <UsagePanel />
      </div>
    );
  }

  // ── Projects / Timeline ──
  if (activeView === "projects") {
    return (
      <div className={`space-y-6 ${isMobile ? 'pb-20' : ''}`}>
        <div>
          <h1 className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-white`}>
             {currentProject?.name ?? "Projects and timeline"}
          </h1>
          <p className="mt-1 text-sm text-white/40">
            {isMobile ? 'Project overview' : 'Gantt calendar with tasks, deliverables, and photo evidence.'}
          </p>
        </div>

        {currentProject && !isMobile && (
          <BudgetPanel project={currentProject} tasks={tasks} />
        )}

        {isMobile && currentProject && (
          <div className="glass-card p-4 border-white/5">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-bold uppercase text-white/40">Budget</span>
              <span className="text-sm font-bold text-white">{money(currentProject.budget_total_cents)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase text-white/40">Spent</span>
              <span className="text-sm font-bold text-amber-400">{money(currentProject.spent_total_cents)}</span>
            </div>
          </div>
        )}

        {tasks.length > 0 ? (
          <div className="space-y-2">
            {!isMobile && (
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40">
                Task timeline
              </h2>
            )}

            <Toolbar>
              <SearchInput
                value={taskSearch}
                onChange={setTaskSearch}
                placeholder="Search tasks…"
              />
              <FilterChips<"all" | "pending" | "in_progress" | "completed">
                options={[
                  { value: "all", label: "All", count: tasks.length },
                  { value: "pending", label: "Pending", count: tasks.filter((t) => t.status === "pending").length, color: "#6b7280" },
                  { value: "in_progress", label: "Active", count: tasks.filter((t) => t.status === "in_progress").length, color: "#3b82f6" },
                  { value: "completed", label: "Done", count: tasks.filter((t) => t.status === "completed").length, color: "#10b981" },
                ]}
                value={taskStatusFilter}
                onChange={setTaskStatusFilter}
              />
              <SortMenu<"end_asc" | "end_desc" | "progress_desc" | "progress_asc" | "budget_desc" | "title_asc">
                options={[
                  { value: "end_asc", label: "End date ↑" },
                  { value: "end_desc", label: "End date ↓" },
                  { value: "progress_desc", label: "Progress ↓" },
                  { value: "progress_asc", label: "Progress ↑" },
                  { value: "budget_desc", label: "Budget ↓" },
                  { value: "title_asc", label: "Title A-Z" },
                ]}
                value={taskSort}
                onChange={setTaskSort}
              />
            </Toolbar>

            {filteredTasks.length === 0 && (
              <div className="py-10 text-center glass-card border-dashed border-white/10">
                <div className="text-sm font-bold text-white/30 uppercase tracking-[0.2em]">No tasks match the filters</div>
                <button
                  type="button"
                  onClick={() => { setTaskSearch(""); setTaskStatusFilter("all"); }}
                  className="mt-3 text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300"
                >
                  Clear filters
                </button>
              </div>
            )}

            {isMobile ? (
              <div className="space-y-3">
                {filteredTasks.map((task) => (
                  <div key={task.id} className="glass-card p-4 border-white/5">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-bold text-white text-sm">{task.title}</div>
                      <span className={`badge ${statusBadge(task.status)}`}>{task.status}</span>
                    </div>
                    <div className="text-xs text-white/40">{task.start_date} → {task.end_date}</div>
                    <div className="mt-2">
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-white/40">Progress</span>
                        <span className="text-white">{task.progress_percent}%</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill bg-blue-500" style={{ width: `${task.progress_percent}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredTasks.length > 0 ? (
              <>
                {onGanttZoomChange && (
                  <div className="flex items-center justify-end mb-3">
                    <GanttZoomControl value={ganttZoom} onChange={onGanttZoomChange} />
                  </div>
                )}
                <GanttTimeline
                  tasks={filteredTasks}
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
              </>
            ) : null}
          </div>
        ) : (
           <EmptyState text="No tasks in this project yet." />
        )}

        {evidences.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40">
               Recent evidence
            </h2>
            <EvidenceGallery
              evidences={evidences}
              showActions
              onApprove={(id) => onEvidenceDecision(id, "approve")}
              onReject={(id) => onEvidenceDecision(id, "reject")}
              isMobile={isMobile}
            />
          </div>
        )}
      </div>
    );
  }

  // ── Team ──
  if (activeView === "team") {
    const roleColors: Record<string, string> = {
      owner: "#3b82f6", supervisor: "#0ea5e9", helper: "#f59e0b", client: "#10b981", admin: "#ef4444",
    };
    const roleLabels: Record<string, string> = {
      owner: "Owner", supervisor: "Supervisor", helper: "Operator", client: "Client", admin: "Admin",
    };

    const selectedUser = selectedTeamUserId ? users.find((u) => u.id === selectedTeamUserId) : null;

    async function handleExportTeamCSV() {
      if (users.length === 0) {
        toast.error("No team members to export.");
        return;
      }
      const rows: string[][] = [
        ["Name", "Email", "Role", "Active", "Projects"],
        ...users.map((u) => {
          const assignedProjects = u.role === "supervisor"
            ? projects.filter((p: any) => p.supervisor_user_id === u.id).length
            : u.role === "client"
            ? projects.filter((p: any) => p.client_user_id === u.id).length
            : 0;
          return [
            u.full_name || "",
            u.email,
            roleLabels[u.role] ?? u.role,
            u.is_active === false ? "suspended" : "active",
            String(assignedProjects),
          ];
        }),
      ];
      downloadCSV(`team_${new Date().toISOString().slice(0, 10)}.csv`, rows);
      toast.success(`Exported ${users.length} member${users.length === 1 ? "" : "s"}.`);
    }

    if (selectedUser && canManageTeam && token) {
      return (
        <div className={`space-y-6 animate-fadeIn ${isMobile ? "pb-20" : ""}`}>
          <div className="glass-card p-5">
            <TeamMemberDetail
              user={selectedUser as TeamUser}
              isSelf={selectedUser.id === currentUserId}
              token={token}
              projects={projects as unknown as TeamProjectLite[]}
              canAssignProjects
              onBack={() => setSelectedTeamUserId(null)}
              onChanged={async () => { await onTeamChanged?.(); }}
              onDeleted={async () => { setSelectedTeamUserId(null); await onTeamChanged?.(); }}
              onProjectAssignmentChanged={async () => { await onTeamChanged?.(); }}
            />
          </div>
        </div>
      );
    }

    return (
      <div className={`space-y-6 animate-fadeIn ${isMobile ? "pb-20" : ""}`}>
        <div className="flex items-center justify-between pb-4 border-b border-white/5">
          <div>
            <h1 className={`${isMobile ? "text-xl" : "text-2xl"} font-black text-white tracking-tight`}>Team</h1>
            <p className="mt-1 text-xs font-bold text-white/30 uppercase tracking-[0.15em]">
              {users.length} member{users.length !== 1 ? "s" : ""} · {tasks.length} task{tasks.length !== 1 ? "s" : ""}
            </p>
          </div>
          {onInviteUser && (
            <button
              type="button"
              onClick={onInviteUser}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white transition-all"
              style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", boxShadow: "0 4px 16px rgba(139,92,246,0.3)" }}
            >
              <UserPlus size={14} />
              Invite
            </button>
          )}
        </div>

        {users.length > 0 && (
          <Toolbar>
            <SearchInput
              value={teamSearch}
              onChange={setTeamSearch}
              placeholder="Search name or email…"
            />
            <FilterChips<"all" | "owner" | "supervisor" | "helper" | "client">
              options={[
                { value: "all", label: "All", count: users.length },
                { value: "owner", label: "Owner", count: users.filter((u) => u.role === "owner").length, color: "#3b82f6" },
                { value: "supervisor", label: "Supervisor", count: users.filter((u) => u.role === "supervisor").length, color: "#0ea5e9" },
                { value: "helper", label: "Operator", count: users.filter((u) => u.role === "helper").length, color: "#f59e0b" },
                { value: "client", label: "Client", count: users.filter((u) => u.role === "client").length, color: "#10b981" },
              ]}
              value={teamRoleFilter}
              onChange={setTeamRoleFilter}
            />
            <div className="flex-1" />
            <ExportButton onExport={handleExportTeamCSV} />
          </Toolbar>
        )}

        {/* Team members */}
        {users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
              <Users size={24} className="text-white/20" />
            </div>
            <p className="text-sm text-white/40 mb-4">No team members yet.</p>
            {onInviteUser && (
              <button
                type="button"
                onClick={onInviteUser}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white"
                style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)" }}
              >
                <UserPlus size={14} />
                Invite your first team member
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredUsers.length === 0 && (
              <div className="py-10 text-center glass-card border-dashed border-white/10">
                <div className="text-sm font-bold text-white/30 uppercase tracking-[0.2em]">No members match the filters</div>
                <button
                  type="button"
                  onClick={() => { setTeamSearch(""); setTeamRoleFilter("all"); }}
                  className="mt-3 text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300"
                >
                  Clear filters
                </button>
              </div>
            )}
            {filteredUsers.map((u) => {
              const rc = roleColors[u.role] ?? "#6b7280";
              const userTasks = tasks.filter((t) => t.assigned_to_user_id === u.id);
              const completedTasks = userTasks.filter((t) => t.status === "completed").length;
              const clickable = canManageTeam;
              const assignedProjects = u.role === "supervisor"
                ? projects.filter((p: any) => p.supervisor_user_id === u.id).length
                : u.role === "client"
                ? projects.filter((p: any) => p.client_user_id === u.id).length
                : 0;
              const suspended = u.is_active === false;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => clickable && setSelectedTeamUserId(u.id)}
                  disabled={!clickable}
                  className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 transition-colors text-left ${clickable ? "hover:bg-white/10 cursor-pointer" : "cursor-default"}`}
                  style={{ border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white uppercase"
                    style={{ background: `linear-gradient(135deg, ${rc}, ${rc}bb)` }}
                  >
                    {u.full_name?.[0] ?? u.email[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {u.full_name || u.email}
                      {suspended && <span className="ml-2 text-[9px] font-bold uppercase tracking-wider text-red-400">Suspended</span>}
                      {u.id === currentUserId && <span className="ml-2 text-[9px] font-bold uppercase tracking-wider text-blue-400">You</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: rc }}>
                        {roleLabels[u.role] ?? u.role}
                      </span>
                      <span className="text-white/10">·</span>
                      <span className="text-[11px] text-white/30 truncate">{u.email}</span>
                    </div>
                  </div>
                  {(u.role === "supervisor" || u.role === "client") && (
                    <div className="text-right flex-shrink-0 hidden sm:block">
                      <div className="text-xs font-bold text-white/60">{assignedProjects}</div>
                      <div className="text-[10px] text-white/30">project{assignedProjects === 1 ? "" : "s"}</div>
                    </div>
                  )}
                  {userTasks.length > 0 && (
                    <div className="text-right flex-shrink-0 hidden sm:block">
                      <div className="text-xs font-bold text-white/60">{completedTasks}/{userTasks.length}</div>
                      <div className="text-[10px] text-white/30">tasks done</div>
                    </div>
                  )}
                  {clickable && (
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white/40 flex-shrink-0">
                      <Cog size={12} />
                      <span className="hidden sm:inline">Manage</span>
                      <ChevronRight size={14} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Tasks by assignee */}
        {tasks.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-white/5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white/40 uppercase tracking-[0.15em]">Project tasks</h3>
              {onNewTask && (
                <button type="button" onClick={onNewTask} className="flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors">
                  <Plus size={12} /> New task
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {tasks.map((task) => {
                const assignee = users.find((u) => u.id === task.assigned_to_user_id);
                const statusColor = task.status === "completed" ? "#10b981" : task.status === "in_progress" ? "#3b82f6" : "#6b7280";
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onTaskClick?.(task.id)}
                    className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-white/5"
                    style={{ border: "1px solid rgba(255,255,255,0.04)" }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: statusColor }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{task.title}</div>
                      <div className="text-[11px] text-white/30 mt-0.5">
                        {assignee ? assignee.full_name || assignee.email : "Unassigned"} · {task.progress_percent}%
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-mono text-white/40">{money(task.budget_cents)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
