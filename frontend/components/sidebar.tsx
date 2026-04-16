"use client";

import {
  LayoutDashboard, Clock, Users, Camera, FileCheck, Shield,
  Building2, HardHat, ChevronDown, X, Settings, Settings2,
  Eye, FolderKanban, MonitorPlay, TrendingUp, AlignLeft, MessageSquare, Box
} from "lucide-react";
import { useState } from "react";

type LoginResponse = {
  access_token: string;
  user: { id: string; email: string; full_name: string; role: string; tenant_id: string };
};
type Project = { id: string; name: string; status: string };

const MENU_ICONS: Record<string, React.ReactNode> = {
  overview:  <LayoutDashboard size={16} />,
  projects:  <FolderKanban size={16} />,
  team:      <Users size={16} />,
  review:    <FileCheck size={16} />,
  timeline:  <Clock size={16} />,
  capture:   <Camera size={16} />,
  history:   <FileCheck size={16} />,
  summary:   <LayoutDashboard size={16} />,
  gallery:   <Camera size={16} />,
  platform:  <Building2 size={16} />,
  rbac:      <Shield size={16} />,
  finances:  <TrendingUp size={16} />,
  journal:   <AlignLeft size={16} />,
  messages:  <MessageSquare size={16} />,
  blueprints: <Box size={16} />,
  // Owner full-access extras
  ownerreview: <Eye size={16} />,
  ownertimeline: <Clock size={16} />,
  ownercapture: <Camera size={16} />,
  ownerhistory: <FileCheck size={16} />,
  ownersummary: <MonitorPlay size={16} />,
  ownergallery: <Camera size={16} />,
};

function menuForRole(role: string) {
  const r = role?.toLowerCase() ?? "";
  switch (r) {
    case "owner":
      return [
        { id: "overview",      label: "Executive overview",   tag: "owner",    group: "owner" },
        { id: "projects",      label: "Projects and timeline",tag: "delivery", group: "owner" },
        { id: "finances",      label: "Finance and costs",    tag: "money",    group: "owner" },
        { id: "journal",       label: "Daily log",            tag: "site",     group: "owner" },
        { id: "messages",      label: "Messages and RFI",     tag: "chat",     group: "owner" },
        { id: "blueprints",    label: "CAD and 3D files",     tag: "cad",      group: "owner" },
        { id: "ownergallery",  label: "Progress gallery",     tag: "view",     group: "owner" },
        { id: "team",          label: "Team and tasks",       tag: "crm",      group: "owner" },
        { id: "review",        label: "Review queue",         tag: "qa",       group: "owner" },
        { id: "timeline",      label: "Timeline Gantt",       tag: "gantt",    group: "owner" },
        { id: "capture",       label: "Capture progress",     tag: "field",    group: "owner" },
        { id: "history",       label: "Field history",        tag: "proof",    group: "owner" },
        { id: "summary",       label: "Client view",          tag: "client",   group: "owner" },
        { id: "gallery",       label: "Approved gallery",     tag: "view",     group: "owner" },
      ];
    case "supervisor":
      return [
        { id: "review",    label: "Review queue",     tag: "qa",    group: "supervisor" },
        { id: "timeline",  label: "Timeline Gantt",   tag: "track", group: "supervisor" },
        { id: "finances",  label: "Expenses",         tag: "money", group: "supervisor" },
        { id: "journal",   label: "Daily log",        tag: "site",  group: "supervisor" },
        { id: "messages",  label: "Messages",         tag: "chat",  group: "supervisor" },
        { id: "blueprints", label: "CAD and 3D files",tag: "cad",   group: "supervisor" },
        { id: "gallery",    label: "Progress gallery",tag: "view",  group: "supervisor" },
      ];
    case "helper":
      return [
        { id: "capture",  label: "Capture progress", tag: "field", group: "helper" },
        { id: "history",  label: "History",          tag: "proof", group: "helper" },
      ];
    case "client":
      return [
        { id: "summary", label: "Project summary",  tag: "client", group: "client" },
        { id: "gallery", label: "Final gallery",    tag: "view",   group: "client" },
        { id: "blueprints", label: "CAD and 3D files", tag: "cad",    group: "client" },
      ];
    default:
      return [
        { id: "platform", label: "Platform", tag: "admin",    group: "admin" },
        { id: "rbac",     label: "RBAC",       tag: "security", group: "admin" },
      ];
  }
}

const roleColors: Record<string, string> = {
  owner:      "#3b82f6",
  supervisor: "#0ea5e9",
  helper:     "#f59e0b",
  client:     "#10b981",
  admin:      "#ef4444",
};

const groupColors: Record<string, string> = {
  owner:      "#3b82f6",
  supervisor: "#0ea5e9",
  helper:     "#f59e0b",
  client:     "#10b981",
  admin:      "#ef4444",
};

const groupLabels: Record<string, string> = {
  owner:      "Owner",
  supervisor: "Supervisor",
  helper:     "Operator",
  client:     "Client",
  admin:      "Admin",
};

type Task = { id: string; title: string; status: string; progress_percent: number };

type SidebarProps = {
  session: LoginResponse;
  activeView: string;
  setActiveView: (view: string) => void;
  projects: Project[];
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  tasks: Task[];
  selectedTaskId: string;
  onTaskSelect: (taskId: string) => void;
  tenants: Array<{ id: string; name: string; slug: string }>;
  pendingEvidenceCount?: number;
  isOpen: boolean;
  onClose: () => void;
  onOpenSettingsGeneral?: () => void;
  onOpenSettingsProject?: () => void;
};

export function Sidebar({
  session,
  activeView,
  setActiveView,
  projects,
  selectedProjectId,
  setSelectedProjectId,
  tasks,
  selectedTaskId,
  onTaskSelect,
  tenants,
  pendingEvidenceCount = 0,
  isOpen,
  onClose,
  onOpenSettingsGeneral,
  onOpenSettingsProject,
}: SidebarProps) {
  const [projectOpen, setProjectOpen] = useState(false);
  const menu = menuForRole(session.user.role);
  const roleColor = roleColors[session.user.role.toLowerCase()] ?? "#6b7280";
  const currentProject = projects.find((p) => p.id === selectedProjectId);
  const isOwner = session.user.role.toLowerCase() === "owner";

  function handleNavClick(viewId: string) {
    setActiveView(viewId);
    onClose();
  }

  // No longer grouped — flat nav for all roles

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${isOpen ? "visible" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className={`sidebar ${isOpen ? "open" : ""}`}>
        {/* Logo + close */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold tracking-widest text-white"
              style={{ background: `linear-gradient(135deg, ${roleColor}, ${roleColor}bb)` }}
            >
              PP
            </div>
            <div>
              <div className="text-sm font-semibold text-white leading-tight">ProjectPulse</div>
              <div className="text-xs leading-tight" style={{ color: "#4b5563" }}>Project Control</div>
            </div>
          </div>
          <button
            type="button"
            className="text-gray-500 hover:text-white transition-colors lg:hidden"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-4 px-3 flex-1">
          {menu.map((item) => {
            const active = activeView === item.id;
            const showBadge = item.id === "review" && pendingEvidenceCount > 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm mb-0.5 transition-colors"
                style={{
                  background: active ? "rgba(255,255,255,0.09)" : "transparent",
                  color: active ? "white" : "#9ca3af",
                  borderLeft: active ? `3px solid ${roleColor}` : "3px solid transparent",
                  fontWeight: active ? 600 : 400,
                }}
              >
                <span style={{ color: active ? roleColor : "#6b7280" }}>
                  {MENU_ICONS[item.id] ?? <HardHat size={16} />}
                </span>
                <span className="flex-1">{item.label}</span>
                {showBadge && (
                  <span className="badge-counter">{pendingEvidenceCount}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Project selector */}
        {projects.length > 0 && session.user.role !== "admin" && session.user.role !== "helper" && (
          <div className="mx-4 mb-3 mt-2">
            <div
              className="text-xs font-semibold uppercase tracking-widest mb-2 px-1"
              style={{ color: "#374151" }}
            >
              Active project
            </div>
            <div className="relative">
              <div
                className="flex items-center rounded-xl overflow-hidden"
                style={{ background: "rgba(255,255,255,0.07)" }}
              >
                <button
                  type="button"
                  className="flex-1 flex items-center justify-between px-3 py-2.5 text-left text-sm text-white transition-colors"
                  onClick={() => setProjectOpen((o) => !o)}
                >
                  <span className="truncate text-sm">
                    {currentProject?.name ?? "Select..."}
                  </span>
                  <ChevronDown
                    size={14}
                    className="ml-2 flex-shrink-0 text-gray-500 transition-transform"
                    style={{ transform: projectOpen ? "rotate(180deg)" : "none" }}
                  />
                </button>
                {/* Per-project settings button (owner only) */}
                {isOwner && currentProject && onOpenSettingsProject && (
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center flex-shrink-0 transition-colors"
                    style={{
                      color: "#6b7280",
                      borderLeft: "1px solid rgba(255,255,255,0.06)",
                    }}
                    onClick={onOpenSettingsProject}
                    title="Project settings"
                  >
                    <Settings2 size={14} />
                  </button>
                )}
              </div>
              {projectOpen && (
                <div
                  className="absolute bottom-full mb-1 left-0 right-0 rounded-xl py-1 z-20 max-h-48 overflow-y-auto"
                  style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm transition-colors"
                      style={{
                        color: p.id === selectedProjectId ? "white" : "#9ca3af",
                        background: p.id === selectedProjectId ? "rgba(255,255,255,0.08)" : "transparent",
                      }}
                      onClick={() => {
                        setSelectedProjectId(p.id);
                        setProjectOpen(false);
                      }}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Task list (owner / supervisor) */}
        {tasks.length > 0 && (session.user.role === "owner" || session.user.role === "supervisor") && (
          <div className="mx-4 mb-3">
            <div className="text-xs font-semibold uppercase tracking-widest mb-2 px-1" style={{ color: "#374151" }}>
              Tasks
            </div>
            <div className="space-y-0.5 max-h-44 overflow-y-auto pr-1">
              {tasks.map((task) => {
                const active = task.id === selectedTaskId;
                const statusDot =
                  task.status === "completed" ? "#10b981"
                  : task.status === "in_progress" ? "#3b82f6"
                  : "#6b7280";
                return (
                  <button
                    key={task.id}
                    type="button"
                    className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition-colors"
                    style={{
                      background: active ? "rgba(255,255,255,0.09)" : "transparent",
                      color: active ? "white" : "#9ca3af",
                      borderLeft: active ? `2px solid ${roleColor}` : "2px solid transparent",
                      fontWeight: active ? 600 : 400,
                    }}
                    onClick={() => { onTaskSelect(task.id); onClose(); }}
                    title={`${task.title} · ${task.progress_percent}%`}
                  >
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ background: statusDot }}
                    />
                    <span className="truncate flex-1">{task.title}</span>
                    <span className="flex-shrink-0 text-xs" style={{ color: "#4b5563" }}>
                      {task.progress_percent}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Helper tasks */}
        {tasks.length > 0 && session.user.role === "helper" && (
          <div className="mx-4 mb-3">
            <div className="text-xs font-semibold uppercase tracking-widest mb-2 px-1" style={{ color: "#374151" }}>
              My tasks
            </div>
            <div className="space-y-0.5 max-h-44 overflow-y-auto pr-1">
              {tasks.map((task) => {
                const active = task.id === selectedTaskId;
                return (
                  <button
                    key={task.id}
                    type="button"
                    className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition-colors"
                    style={{
                      background: active ? "rgba(255,255,255,0.09)" : "transparent",
                      color: active ? "white" : "#9ca3af",
                      borderLeft: active ? `2px solid ${roleColor}` : "2px solid transparent",
                      fontWeight: active ? 600 : 400,
                    }}
                    onClick={() => { onTaskSelect(task.id); onClose(); }}
                  >
                    <span className="truncate flex-1">{task.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Admin tenant count */}
        {session.user.role === "admin" && (
          <div className="mx-4 mb-4 mt-auto rounded-xl px-3 py-3" style={{ background: "rgba(255,255,255,0.05)" }}>
            <div className="text-xs" style={{ color: "#4b5563" }}>Registered tenants</div>
            <div className="text-2xl font-bold text-white">{tenants.length}</div>
          </div>
        )}

        {/* Bottom settings bar */}
        <div
          className="mx-4 mb-4 mt-2 flex items-center gap-2"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}
        >
          {onOpenSettingsGeneral && (
            <button
              type="button"
              className="flex items-center gap-2 flex-1 rounded-xl px-3 py-2.5 text-xs transition-colors"
              style={{ color: "#6b7280", background: "rgba(255,255,255,0.04)" }}
              onClick={onOpenSettingsGeneral}
              title="General settings"
            >
              <Settings size={14} />
              <span>Settings</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
