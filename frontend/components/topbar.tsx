"use client";

import { LogOut, Bell, Menu, Download, Settings } from "lucide-react";
import { NotificationsDropdown } from "./notifications-dropdown";

type LoginResponse = {
  access_token: string;
  user: { id: string; email: string; full_name: string; role: string; tenant_id: string };
};
type Project = { id: string; name: string };

const roleColors: Record<string, string> = {
  owner:      "#3b82f6",
  supervisor: "#0ea5e9",
  helper:     "#f59e0b",
  client:     "#10b981",
  admin:      "#ef4444",
};

const roleLabels: Record<string, string> = {
  owner:      "Owner",
  supervisor: "Supervisor",
  helper:     "Helper",
  client:     "Client",
  admin:      "Admin",
};

type TopBarProps = {
  session: LoginResponse;
  currentProject: Project | null;
  activeView: string;
  onLogout: () => void;
  onMenuOpen: () => void;
  onExportCsv?: () => void;
  pendingCount?: number;
  isMobile?: boolean;
  onNotificationClick?: () => void;
  unreadNotifCount: number;
  onUnreadNotifCountChange: (n: number) => void;
  onOpenSettings?: () => void;
};

export function TopBar({
  session,
  currentProject,
  activeView,
  onLogout,
  onMenuOpen,
  onExportCsv,
  pendingCount = 0,
  isMobile = false,
  onNotificationClick,
  unreadNotifCount,
  onUnreadNotifCountChange,
  onOpenSettings,
}: TopBarProps) {
  const roleColor = roleColors[session.user.role] ?? "#6b7280";
  const canExport =
    onExportCsv &&
    currentProject &&
    (session.user.role === "owner" || session.user.role === "supervisor");

  return (
    <header className="topbar">
      {/* Mobile hamburger - hidden when MobileBottomNav is shown */}
      {!isMobile && (
        <button
          type="button"
          className="menu-btn"
          onClick={onMenuOpen}
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>
      )}

      {/* Breadcrumb */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-white/40 text-xs">ProjectPulse</span>
          {currentProject && (
            <>
              <span className="text-white/20 text-xs">/</span>
              <span className="font-semibold text-white truncate text-sm">
                {currentProject.name}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* CSV Export */}
        {canExport && (
          <button
            type="button"
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-white/10 text-white/70 text-xs font-semibold transition-colors hover:bg-white/5"
            onClick={onExportCsv}
            aria-label="Export CSV"
            title="Export project to CSV"
          >
            <Download size={14} />
            <span className="hidden sm:inline">CSV</span>
          </button>
        )}

        {/* Notification bell (in-app notifications) */}
        {isMobile ? (
          <div className="relative">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-white/60 transition-colors hover:bg-white/5"
              aria-label="Pending reviews"
              title={pendingCount > 0 ? `${pendingCount} evidence item(s) pending review` : "No pending reviews"}
              onClick={onNotificationClick}
            >
              <Bell size={16} />
            </button>
            {pendingCount > 0 && (
              <span
                className="absolute -top-1 -right-1 badge-counter"
                style={{ fontSize: 9, minWidth: 16, height: 16, background: "#ef4444", color: "white" }}
              >
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            )}
          </div>
        ) : (
          <NotificationsDropdown
            token={session.access_token}
            unreadCount={unreadNotifCount}
            onCountChange={onUnreadNotifCountChange}
          />
        )}

        {/* User chip */}
        <div className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-1.5 bg-white/5">
          <div
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white uppercase"
            style={{ background: roleColor }}
          >
            {session.user.full_name?.[0] ?? session.user.email[0]}
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-semibold text-white leading-tight">
              {session.user.full_name || session.user.email}
            </div>
            <div
              className="text-[10px] font-bold uppercase tracking-wider leading-tight"
              style={{ color: roleColor, opacity: 0.9 }}
            >
              {roleLabels[session.user.role] ?? session.user.role}
            </div>
          </div>
        </div>

        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-white/60 transition-colors hover:bg-white/5 hover:text-white"
            aria-label="Settings"
            title="Settings"
          >
            <Settings size={16} />
          </button>
        )}

        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white/90 transition-colors hover:bg-white/5"
          aria-label="Sign out"
        >
          <LogOut size={15} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
