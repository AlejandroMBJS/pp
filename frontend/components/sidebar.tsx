"use client";

import {
  LayoutDashboard, Clock, Users, Camera, FileCheck, Shield,
  Building2, HardHat, X, Settings, Settings2,
  Eye, FolderKanban, MonitorPlay, TrendingUp, AlignLeft, MessageSquare, Box
} from "lucide-react";

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

type MenuItem = { id: string; label: string; section?: string };

function menuForRole(role: string): MenuItem[] {
  const r = role?.toLowerCase() ?? "";
  switch (r) {
    case "owner":
      return [
        // Resumen
        { id: "overview",     label: "Executive overview", section: "Resumen" },
        // Trabajo
        { id: "projects",     label: "Projects and timeline", section: "Trabajo" },
        { id: "review",       label: "Review queue",          section: "Trabajo" },
        { id: "capture",      label: "Capture progress",      section: "Trabajo" },
        { id: "history",      label: "Field history",         section: "Trabajo" },
        { id: "ownergallery", label: "Progress gallery",      section: "Trabajo" },
        // Operación
        { id: "finances",     label: "Finance and costs",     section: "Operación" },
        { id: "journal",      label: "Daily log",             section: "Operación" },
        { id: "messages",     label: "Messages and RFI",      section: "Operación" },
        { id: "blueprints",   label: "CAD and 3D files",      section: "Operación" },
        // Equipo y cliente
        { id: "team",         label: "Team",                  section: "Equipo" },
        { id: "summary",      label: "Client view",           section: "Equipo" },
        { id: "gallery",      label: "Approved gallery",      section: "Equipo" },
      ];
    case "supervisor":
      return [
        { id: "review",    label: "Review queue" },
        { id: "timeline",  label: "Timeline Gantt" },
        { id: "finances",  label: "Expenses" },
        { id: "journal",   label: "Daily log" },
        { id: "messages",  label: "Messages" },
        { id: "blueprints", label: "CAD and 3D files" },
        { id: "gallery",    label: "Progress gallery" },
      ];
    case "helper":
      return [
        { id: "capture",  label: "Capture progress" },
        { id: "history",  label: "History" },
        { id: "journal",  label: "Daily log" },
      ];
    case "client":
      return [
        { id: "summary",    label: "Project summary" },
        { id: "gallery",    label: "Final gallery" },
        { id: "blueprints", label: "CAD and 3D files" },
      ];
    default:
      return [
        { id: "platform", label: "Platform" },
        { id: "rbac",     label: "RBAC" },
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

type SidebarProps = {
  session: LoginResponse;
  activeView: string;
  setActiveView: (view: string) => void;
  projects: Project[];
  selectedProjectId: string;
  tenants: Array<{ id: string; name: string; slug: string }>;
  pendingEvidenceCount?: number;
  isOpen: boolean;
  onClose: () => void;
  onOpenSettingsGeneral?: () => void;
  onOpenSettingsProject?: () => void;
  tenantLogoUrl?: string;
  tenantName?: string;
  brandPrimary?: string;
};

export function Sidebar({
  session,
  activeView,
  setActiveView,
  projects,
  selectedProjectId,
  tenants,
  pendingEvidenceCount = 0,
  isOpen,
  onClose,
  onOpenSettingsGeneral,
  onOpenSettingsProject,
  tenantLogoUrl,
  tenantName,
  brandPrimary,
}: SidebarProps) {
  const menu = menuForRole(session.user.role);
  // Tenant brand override beats the role default. Falls back to role color
  // for the platform-admin "Admin" theme so multi-tenant ops look distinct.
  const roleColor = brandPrimary?.trim()
    || roleColors[session.user.role.toLowerCase()]
    || "#6b7280";
  const currentProject = projects.find((p) => p.id === selectedProjectId);
  const isOwner = session.user.role.toLowerCase() === "owner";

  function handleNavClick(viewId: string) {
    setActiveView(viewId);
    onClose();
  }

  // Group nav items by section header (owner only). Other roles render flat.
  let lastSection: string | undefined;

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
            {tenantLogoUrl ? (
              <img
                src={tenantLogoUrl}
                alt=""
                className="h-9 w-9 rounded-xl object-cover"
              />
            ) : (
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold tracking-widest text-white"
                style={{ background: `linear-gradient(135deg, ${roleColor}, ${roleColor}bb)` }}
              >
                {tenantName ? tenantName[0].toUpperCase() : "PP"}
              </div>
            )}
            <div>
              <div className="text-sm font-semibold text-white leading-tight">{tenantName || "ProjectPulse"}</div>
              <div className="text-xs leading-tight" style={{ color: "#4b5563" }}>Project Control</div>
            </div>
          </div>
          <button
            type="button"
            className="text-white/40 hover:text-white transition-colors lg:hidden"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-4 px-3 flex-1 overflow-y-auto">
          {menu.map((item) => {
            const active = activeView === item.id;
            const showBadge = item.id === "review" && pendingEvidenceCount > 0;
            const sectionHeader = item.section && item.section !== lastSection ? item.section : null;
            if (item.section) lastSection = item.section;
            return (
              <div key={item.id}>
                {sectionHeader && (
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30 px-3 mt-4 mb-2 first:mt-0">
                    {sectionHeader}
                  </div>
                )}
                <button
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
              </div>
            );
          })}
        </nav>

        {/* Project settings shortcut (owner only, when a project is active).
            The project picker itself moved to the topbar. */}
        {isOwner && currentProject && onOpenSettingsProject && (
          <button
            type="button"
            className="mx-4 mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs transition-colors"
            style={{ color: "#9ca3af", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
            onClick={onOpenSettingsProject}
            title="Project settings"
          >
            <Settings2 size={12} />
            <span className="truncate">Project settings · {currentProject.name}</span>
          </button>
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
