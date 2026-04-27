"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import {
  Settings, Settings2, ChevronDown, ChevronRight,
  UserPlus, FolderPlus, ListTodo, CheckCircle2, Clock3,
  Upload, Star, Eye, XCircle, ExternalLink, Copy,
  Building2, Shield, Camera, Zap,
} from "lucide-react";
import { Input, Select } from "./ui/form-input";
import { EmptyState } from "./ui/empty-state";
import { Loader2 } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

type User = { id: string; email: string; full_name: string; role: string };
type Project = { id: string; name: string; budget_total_cents: number; spent_total_cents: number };
type Task = { id: string; title: string; status: string; end_date: string; progress_percent: number; budget_cents: number };
type Deliverable = { id: string; task_id: string; title: string; due_date: string; status: string };
type Evidence = {
  id: string; file_name: string; status: string; quality_score: number;
  ai_processing_status: string; url_archivo?: string; created_at?: string;
  is_visible_to_client?: boolean; task_id?: string;
};
type RBACRule = { resource: string; role: string; effect: string };
type LoginResponse = { access_token: string; user: { id: string; email: string; full_name: string; role: string } };
type UserInvite = { user: User; invite_url: string; invite_expires_at: string };

type RightInspectorProps = {
  session: LoginResponse;
  activeView: string;
  users: User[];
  supervisors: User[];
  helpers: User[];
  clients: User[];
  newUser: { full_name: string; email: string; role: string };
  setNewUser: (v: any) => void;
  lastUserInvite?: UserInvite | null;
  newProject: any;
  setNewProject: (v: any) => void;
  newTask: any;
  setNewTask: (v: any) => void;
  currentProject: Project | null;
  currentTask: Task | null;
  deliverables: Deliverable[];
  evidences: Evidence[];
  rbac: RBACRule[];
  onCreateUser: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onCopyInviteLink?: () => Promise<void> | void;
  onCreateProject: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onCreateTask: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onDeliverableClick?: (deliverableId: string) => void;
  onOpenSettingsGeneral?: () => void;
  onOpenSettingsProject?: () => void;
  onOpenTaskApproval?: (evidenceIndex?: number) => void;
  onOpenPhotoUpload?: () => void;
  loading: boolean;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function money(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN", maximumFractionDigits: 0,
  }).format((value || 0) / 100);
}

const roleColors: Record<string, string> = {
  owner:      "#3b82f6",
  supervisor: "#0ea5e9",
  helper:     "#f59e0b",
  client:     "#10b981",
  admin:      "#ef4444",
};
const roleLabels: Record<string, string> = {
  owner: "Owner", supervisor: "Supervisor", helper: "Operator", client: "Client", admin: "Admin",
};

function statusThumb(status: string) {
  if (status === "approved" || status === "committed") return "✅";
  if (status === "rejected") return "❌";
  return "🕐";
}

// ── Accordion Item ─────────────────────────────────────────────────────────

function Accordion({
  icon,
  iconBg,
  title,
  subtitle,
  children,
  defaultOpen = false,
  badge,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="accordion-item">
      <button className="accordion-trigger" type="button" onClick={() => setOpen((v) => !v)}>
        <div
          className="inspector-action-icon"
          style={{ background: iconBg }}
        >
          <span style={{ color: "white" }}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</div>
          {subtitle && (
            <div className="text-xs mt-0.5 truncate" style={{ color: "var(--text-tertiary)" }}>{subtitle}</div>
          )}
        </div>
        {badge !== undefined && badge > 0 && (
          <span className="badge-counter">{badge}</span>
        )}
        {open
          ? <ChevronDown size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
          : <ChevronRight size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
        }
      </button>
      {open && <div className="accordion-content">{children}</div>}
    </div>
  );
}

// ── Role header ─────────────────────────────────────────────────────────────

function InspectorRoleHeader({
  session,
  onOpenSettingsGeneral,
}: {
  session: LoginResponse;
  onOpenSettingsGeneral?: () => void;
}) {
  const role = session.user.role;
  const color = roleColors[role] ?? "#6b7280";
  const label = roleLabels[role] ?? role;
  return (
    <div className="inspector-header py-5">
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
        style={{ background: color }}
      >
        {session.user.full_name?.[0] ?? session.user.email[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
          {session.user.full_name || session.user.email}
        </div>
        <div
          className="inspector-role-pill"
          style={{ background: `${color}18`, color }}
        >
          {label}
        </div>
      </div>
      {onOpenSettingsGeneral && (
        <button
          type="button"
          onClick={onOpenSettingsGeneral}
          className="flex h-10 w-10 items-center justify-center rounded-2xl transition-all hover:bg-white/10 active:scale-95 flex-shrink-0"
          title="General settings"
          style={{ color: "var(--text-secondary)", border: "1px solid var(--glass-border)" }}
        >
          <Settings size={16} />
        </button>
      )}
    </div>
  );
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────

export function RightInspector({
  session,
  activeView,
  users,
  supervisors,
  helpers,
  clients,
  newUser, setNewUser,
  lastUserInvite,
  newProject, setNewProject,
  newTask, setNewTask,
  currentProject,
  currentTask,
  deliverables,
  evidences,
  rbac,
  onCreateUser,
  onCopyInviteLink,
  onCreateProject,
  onCreateTask,
  onDeliverableClick,
  onOpenSettingsGeneral,
  onOpenSettingsProject,
  onOpenTaskApproval,
  onOpenPhotoUpload,
  loading,
}: RightInspectorProps) {
  const role = session.user.role;
  const pendingEvidences = evidences.filter((e) => e.status === "pending_approval");

  // ── Owner ──────────────────────────────────────────────────────────────────
  if (role === "owner") {
    return (
      <aside className="right-inspector">
        <InspectorRoleHeader session={session} onOpenSettingsGeneral={onOpenSettingsGeneral} />
        <div className="inspector-divider" />

        {/* Project settings shortcut */}
        {currentProject && (
          <div className="inspector-section py-3">
            <button
              type="button"
              className="inspector-action-btn"
              onClick={onOpenSettingsProject}
            >
              <div className="inspector-action-icon" style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>
                <Settings2 size={16} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                  {currentProject.name}
                </div>
                <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Edit project settings
                </div>
              </div>
              <ChevronRight size={14} style={{ color: "var(--text-tertiary)" }} />
            </button>
          </div>
        )}

        <div className="inspector-divider" />

        {/* Accordions */}
        <div className="inspector-section py-3 space-y-2.5">
          {/* Team onboarding */}
          <Accordion
            icon={<UserPlus size={15} />}
            iconBg="var(--accent-gradient)"
            title="Team onboarding"
            subtitle="Supervisor, operator, or client"
            badge={users.length}
          >
            <form onSubmit={onCreateUser} className="space-y-3">
              <Input placeholder="Full name" value={newUser.full_name} onChange={(v) => setNewUser({ ...newUser, full_name: v })} required />
              <Input placeholder="Email" value={newUser.email} onChange={(v) => setNewUser({ ...newUser, email: v })} required />
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] leading-relaxed" style={{ color: "#6ee7b7" }}>
                Members receive a one-time invite link and choose their own password during activation.
              </div>
              <Select
                value={newUser.role}
                onChange={(v) => setNewUser({ ...newUser, role: v })}
                options={[
                  { label: "Supervisor", value: "supervisor" },
                  { label: "Operator", value: "helper" },
                  { label: "Client", value: "client" },
                ]}
              />
              <button className="btn-primary w-full" disabled={loading || !newUser.full_name.trim() || !newUser.email.trim()}>
                {loading ? <><Loader2 size={14} className="animate-spin" /> Creating invite...</> : "Create secure invite"}
              </button>
              {lastUserInvite && (
                <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-black uppercase tracking-[0.2em] text-blue-300">Invite ready</div>
                      <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                        {lastUserInvite.user.full_name} · {lastUserInvite.user.email}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onCopyInviteLink?.()}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-400/20 text-blue-200 transition-colors hover:bg-blue-400/10"
                      title="Copy invite link"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-[11px] font-mono break-all text-blue-100/85">
                    {lastUserInvite.invite_url}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Expires: {new Date(lastUserInvite.invite_expires_at).toLocaleString("es-MX")}
                  </div>
                </div>
              )}
              {/* Mini member list */}
              {users.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {users.slice(0, 4).map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 border border-white/5"
                      style={{ background: "rgba(255,255,255,0.02)" }}
                    >
                      <div
                        className="flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold text-white flex-shrink-0"
                        style={{ background: roleColors[u.role] ?? "#6b7280" }}
                      >
                        {u.full_name?.[0] ?? u.email[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                          {u.full_name || u.email}
                        </div>
                      </div>
                      <span
                        className="text-xs font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: `${roleColors[u.role] ?? "#6b7280"}18`, color: roleColors[u.role] ?? "#6b7280" }}
                      >
                        {roleLabels[u.role] ?? u.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </form>
          </Accordion>

          {/* New project */}
          <Accordion
            icon={<FolderPlus size={15} />}
            iconBg="linear-gradient(135deg, #10b981, #059669)"
            title="New project"
            subtitle="Scope, budget, and owners"
          >
            <form onSubmit={onCreateProject} className="space-y-3">
              <Input placeholder="Project name" value={newProject.name} onChange={(v) => setNewProject({ ...newProject, name: v })} />
              <Input placeholder="Description" value={newProject.description} onChange={(v) => setNewProject({ ...newProject, description: v })} />
              <Select
                value={newProject.supervisor_user_id}
                onChange={(v) => setNewProject({ ...newProject, supervisor_user_id: v })}
                options={supervisors.map((u) => ({ label: u.full_name, value: u.id }))}
                placeholder="Select supervisor..."
              />
              <Select
                value={newProject.client_user_id}
                onChange={(v) => setNewProject({ ...newProject, client_user_id: v })}
                options={clients.map((u) => ({ label: u.full_name, value: u.id }))}
                placeholder="Select client..."
              />
              <Input
                placeholder="Total budget (MXN)"
                type="number"
                value={String(Math.round(newProject.budget_total_cents / 100))}
                onChange={(v) => setNewProject({ ...newProject, budget_total_cents: Math.max(0, Number(v)) * 100 })}
              />
              <button className="btn-secondary w-full" disabled={loading || !newProject.name}>
                {loading ? <><Loader2 size={14} className="animate-spin" /> Creating...</> : "Create project"}
              </button>
            </form>
          </Accordion>

          {/* New task */}
          <Accordion
            icon={<ListTodo size={15} />}
            iconBg="linear-gradient(135deg, #f59e0b, #d97706)"
            title="New task"
            subtitle={currentProject ? `In "${currentProject.name}"` : "Select a project first"}
          >
            <form onSubmit={onCreateTask} className="space-y-3">
              {!currentProject && (
                <div
                  className="rounded-xl px-3 py-2 text-xs"
                  style={{ background: "var(--amber-light)", color: "var(--amber-strong)" }}
                >
                  Select a project to create tasks.
                </div>
              )}
              <Input placeholder="Task title" value={newTask.title} onChange={(v) => setNewTask({ ...newTask, title: v })} />
              <Input placeholder="Description" value={newTask.description} onChange={(v) => setNewTask({ ...newTask, description: v })} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Start" type="date" value={newTask.start_date} onChange={(v) => setNewTask({ ...newTask, start_date: v })} />
                <Input placeholder="End" type="date" value={newTask.end_date} onChange={(v) => setNewTask({ ...newTask, end_date: v })} />
              </div>
              <Input placeholder="Budget (MXN)" type="number" value={String(Math.round((newTask.budget_cents || 0) / 100))} onChange={(v) => setNewTask({ ...newTask, budget_cents: Number(v) * 100 })} />
              <Select
                value={newTask.assigned_to_user_id}
                onChange={(v) => setNewTask({ ...newTask, assigned_to_user_id: v })}
                options={helpers.map((u) => ({ label: u.full_name, value: u.id }))}
                placeholder="Assign to..."
              />
              <Input placeholder="Deliverable title" value={newTask.deliverable_title} onChange={(v) => setNewTask({ ...newTask, deliverable_title: v })} />
              <Input placeholder="Deliverable date" value={newTask.deliverable_due_date} onChange={(v) => setNewTask({ ...newTask, deliverable_due_date: v })} />

              {/* VisionCheck: requires comparison checkbox */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!newTask.requires_comparison}
                    onChange={(e) => setNewTask({ ...newTask, requires_comparison: e.target.checked, comparison_file: e.target.checked ? newTask.comparison_file : null })}
                    className="w-4 h-4 rounded border-white/20 bg-white/5 accent-blue-500"
                  />
                  <span className="text-[11px] font-bold text-white/70 uppercase tracking-wide">Requiere comparación con IA (VisionCheck)</span>
                </label>
                {newTask.requires_comparison && (
                  <>
                    <p className="text-[10px] text-white/40 leading-snug">
                      Sube la foto de referencia (render/objetivo). La IA comparará la evidencia del helper contra esta imagen y rechazará automáticamente si la similitud es menor al 80%.
                    </p>
                    {newTask.comparison_file ? (
                      <div className="flex items-center justify-between gap-2 text-[11px] bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2">
                        <span className="text-blue-300 truncate font-semibold">{newTask.comparison_file.name}</span>
                        <button type="button" onClick={() => setNewTask({ ...newTask, comparison_file: null })} className="text-white/50 hover:text-white">✕</button>
                      </div>
                    ) : (
                      <label
                        className="block w-full cursor-pointer rounded-lg border-2 border-dashed border-white/15 hover:border-blue-500/40 hover:bg-blue-500/5 transition-all py-4 text-center"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const f = e.dataTransfer.files[0];
                          if (f && f.type.startsWith("image/")) setNewTask({ ...newTask, comparison_file: f });
                        }}
                      >
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif,image/tiff,image/avif,image/bmp,image/heic"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f && f.type.startsWith("image/")) setNewTask({ ...newTask, comparison_file: f });
                            e.target.value = "";
                          }}
                        />
                        <p className="text-[11px] font-bold text-white/50">Arrastra o selecciona la imagen de referencia</p>
                        <p className="text-[9px] text-white/30 mt-0.5">PNG, JPG, WebP, GIF, TIFF, AVIF, BMP, HEIC</p>
                      </label>
                    )}
                  </>
                )}
              </div>

              <button className="btn-primary w-full" disabled={loading || !newTask.title || !currentProject || (newTask.requires_comparison && !newTask.comparison_file)}>
                {loading ? <><Loader2 size={14} className="animate-spin" /> Creating...</> : "Create task"}
              </button>
            </form>
          </Accordion>
        </div>
      </aside>
    );
  }

  // ── Supervisor ─────────────────────────────────────────────────────────────
  if (role === "supervisor") {
    return (
      <aside className="right-inspector">
        <InspectorRoleHeader session={session} onOpenSettingsGeneral={onOpenSettingsGeneral} />
        <div className="inspector-divider" />

        {/* Active task card */}
        <div className="inspector-section py-4">
          {currentTask ? (
            <div
              className="rounded-2xl p-4 space-y-3"
              style={{
                background: "linear-gradient(135deg, rgba(14,165,233,0.08), rgba(3,105,161,0.04))",
                border: "1px solid rgba(14,165,233,0.2)",
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #0ea5e9, #0369a1)" }}
                >
                  <Zap size={15} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate" style={{ color: "#0c4a6e" }}>
                    {currentTask.title}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "#0369a1" }}>
                    Due {currentTask.end_date}
                  </div>
                </div>
              </div>
              {/* Progress ring replacement (linear for space) */}
              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: "#0369a1" }}>
                  <span>Progress</span>
                  <span className="font-bold">{currentTask.progress_percent}%</span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${currentTask.progress_percent}%`,
                      background: "linear-gradient(90deg, #0ea5e9, #0369a1)",
                    }}
                  />
                </div>
              </div>
              <div className="text-xs font-semibold" style={{ color: "#0e7490" }}>
                {money(currentTask.budget_cents)} budget
              </div>
            </div>
          ) : (
            <EmptyState text="Select a task from the sidebar." />
          )}
        </div>

        <div className="inspector-divider" />

        {/* Pending evidence section */}
        <div className="inspector-section py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
              Pending evidence
            </div>
            {pendingEvidences.length > 0 && (
              <span className="badge-counter">{pendingEvidences.length}</span>
            )}
          </div>

          {pendingEvidences.length === 0 ? (
            <div
              className="rounded-xl px-4 py-5 text-center text-xs"
              style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)", color: "var(--green-strong)" }}
            >
              ✅ Up to date — no pending evidence
            </div>
          ) : (
            <>
              <div className="evidence-thumb-grid">
                {pendingEvidences.slice(0, 4).map((e, i) => (
                  <button
                    key={e.id}
                    type="button"
                    className="evidence-thumb pending"
                    onClick={() => onOpenTaskApproval?.(i)}
                    title={e.file_name}
                  >
                    {e.url_archivo ? (
                      <img src={e.url_archivo} alt={e.file_name} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl">📸</div>
                    )}
                    <div className="evidence-thumb-status" style={{ background: "rgba(245,158,11,0.9)" }}>
                      🕐
                    </div>
                    {e.quality_score > 0 && (
                      <div className="evidence-thumb-score">
                        ★ {e.quality_score}
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="inspector-action-btn glow-pulse"
                onClick={() => onOpenTaskApproval?.(0)}
                style={{ borderColor: "rgba(14,165,233,0.25)" }}
              >
                <div className="inspector-action-icon" style={{ background: "linear-gradient(135deg, #0ea5e9, #0369a1)" }}>
                  <Eye size={16} className="text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    Review and approve
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {pendingEvidences.length} evidence item{pendingEvidences.length > 1 ? "s" : ""} waiting for decision
                  </div>
                </div>
                <ChevronRight size={14} style={{ color: "var(--text-tertiary)", marginLeft: "auto" }} />
              </button>
            </>
          )}
        </div>

        <div className="inspector-divider" />

        {/* Deliverables */}
        <div className="inspector-section py-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            Deliverables
          </div>
          {deliverables.length === 0 ? (
            <EmptyState text="No deliverables linked yet." />
          ) : (
            <div className="space-y-1.5">
              {deliverables.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="w-full flex items-center gap-2.5 rounded-2xl px-4 py-4 text-left transition-all"
                  style={{
                    border: "1px solid var(--glass-border)",
                    background: "rgba(255,255,255,0.02)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                  }}
                  onClick={() => onDeliverableClick?.(d.id)}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(14,165,233,0.25)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(14,165,233,0.1)";
                    (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,0,0,0.07)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.03)";
                    (e.currentTarget as HTMLElement).style.transform = "none";
                  }}
                >
                  {d.status === "approved" ? (
                    <CheckCircle2 size={15} style={{ color: "#10b981", flexShrink: 0 }} />
                  ) : (
                    <Clock3 size={15} style={{ color: "#f59e0b", flexShrink: 0 }} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                      {d.title}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{d.due_date}</div>
                  </div>
                  <ExternalLink size={12} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent processed evidences */}
        {evidences.filter((e) => e.status !== "pending_approval").length > 0 && (
          <>
            <div className="inspector-divider" />
            <div className="inspector-section py-4 space-y-2">
              <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
                Recently processed
              </div>
              {evidences
                .filter((e) => e.status !== "pending_approval")
                .slice(0, 4)
                .map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-2.5 rounded-xl px-4 py-3 border border-white/5"
                    style={{ background: "rgba(255,255,255,0.02)" }}
                  >
                    <span className="text-base flex-shrink-0">{statusThumb(e.status)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                        {e.file_name}
                      </div>
                      {e.quality_score > 0 && (
                        <div className="flex items-center gap-1 text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                          <Star size={10} />
                          AI score: {e.quality_score}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}
      </aside>
    );
  }

  // ── Helper ──────────────────────────────────────────────────────────────────
  if (role === "helper") {
    return (
      <aside className="right-inspector">
        <InspectorRoleHeader session={session} onOpenSettingsGeneral={onOpenSettingsGeneral} />
        <div className="inspector-divider" />

        {/* Active task */}
        <div className="inspector-section py-4">
          {currentTask ? (
            <div
              className="rounded-2xl p-4 space-y-3"
              style={{
                background: "linear-gradient(135deg, rgba(245,158,11,0.08), rgba(217,119,6,0.04))",
                border: "1px solid rgba(245,158,11,0.2)",
              }}
            >
              <div className="text-sm font-bold" style={{ color: "#78350f" }}>
                {currentTask.title}
              </div>
              <div className="text-xs" style={{ color: "#b45309" }}>
                Due: {currentTask.end_date} · {currentTask.progress_percent}% progress
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${currentTask.progress_percent}%`, background: "linear-gradient(90deg, #f59e0b, #d97706)" }}
                />
              </div>
            </div>
          ) : (
            <EmptyState text="Select a task to upload evidence." />
          )}
        </div>

        <div className="inspector-divider" />

        {/* Upload CTA */}
        <div className="inspector-section py-4">
          <button
            type="button"
            className="inspector-action-btn glow-pulse"
            onClick={onOpenPhotoUpload}
            disabled={!currentTask}
            style={{
              borderColor: currentTask ? "rgba(245,158,11,0.3)" : undefined,
              opacity: currentTask ? 1 : 0.5,
            }}
          >
            <div className="inspector-action-icon" style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>
              <Camera size={18} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Upload photo evidence
              </div>
              <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                Drag and drop or device camera
              </div>
            </div>
            <Upload size={14} style={{ color: "var(--text-tertiary)", marginLeft: "auto" }} />
          </button>
        </div>

        <div className="inspector-divider" />

        {/* Evidence history */}
        <div className="inspector-section py-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            My evidence
          </div>
          {evidences.length === 0 ? (
            <EmptyState text="You have not uploaded evidence for this task yet." />
          ) : (
            <div className="space-y-1.5">
              {evidences.slice(0, 5).map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-2.5 rounded-xl px-4 py-3 border border-white/5"
                  style={{ background: "rgba(255,255,255,0.02)" }}
                >
                  <span className="text-base flex-shrink-0">{statusThumb(e.status)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                      {e.file_name}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {e.quality_score > 0 ? `AI score: ${e.quality_score}` : "No score yet"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="inspector-divider" />

        {/* Tips */}
        <div className="inspector-section py-4">
          <div
            className="rounded-xl px-4 py-3 space-y-2"
            style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.06), rgba(217,119,6,0.03))", border: "1px solid rgba(245,158,11,0.15)" }}
          >
            <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "#d97706" }}>
              Capture tips
            </div>
            <ul className="space-y-1.5 text-xs" style={{ color: "#78350f" }}>
              <li>📸 Capture the full working area in each shot.</li>
              <li>☀️ Avoid blur and backlight.</li>
              <li>📍 Stay inside the project geofence.</li>
            </ul>
          </div>
        </div>
      </aside>
    );
  }

  // ── Client ─────────────────────────────────────────────────────────────────
  if (role === "client") {
    return (
      <aside className="right-inspector">
        <InspectorRoleHeader session={session} />
        <div className="inspector-divider" />

        <div className="inspector-section py-4 space-y-3">
          <div
            className="rounded-2xl px-4 py-3 text-xs"
            style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.07), rgba(5,150,105,0.04))", border: "1px solid rgba(16,185,129,0.18)", color: "#065f46" }}
          >
            <span className="font-semibold">Curated view</span> — You only see deliverables and evidence approved by the team.
          </div>

          <div
            className="rounded-xl px-4 py-3 text-xs flex items-start gap-2"
            style={{
              background: "color-mix(in srgb, var(--accent-blue) 6%, transparent)",
              border: "1px solid color-mix(in srgb, var(--accent-blue) 14%, transparent)",
              color: "var(--accent-blue)",
            }}
          >
            <ExternalLink size={12} className="flex-shrink-0 mt-0.5" />
            Click any timeline deliverable to jump to the matching point.
          </div>
        </div>

        {deliverables.filter((d) => d.status === "approved").length > 0 && (
          <>
            <div className="inspector-divider" />
            <div className="inspector-section py-4 space-y-2">
              <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
                Approved deliverables
              </div>
              {deliverables
                .filter((d) => d.status === "approved")
                .map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-3 text-left transition-all border border-green-500/10"
                    style={{ background: "rgba(16,185,129,0.04)" }}
                    onClick={() => onDeliverableClick?.(d.id)}
                  >
                    <CheckCircle2 size={14} style={{ color: "#10b981", flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>{d.title}</div>
                      <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{d.due_date}</div>
                    </div>
                    <ExternalLink size={11} style={{ color: "#10b981", flexShrink: 0 }} />
                  </button>
                ))}
            </div>
          </>
        )}
      </aside>
    );
  }

  // ── Admin ───────────────────────────────────────────────────────────────────
  return (
    <aside className="right-inspector">
      <InspectorRoleHeader session={session} onOpenSettingsGeneral={onOpenSettingsGeneral} />
      <div className="inspector-divider" />

      <div className="inspector-section py-4 space-y-3">
        <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
          Active RBAC rules
        </div>
        {rbac.length === 0 ? (
          <EmptyState text="No RBAC rules configured." />
        ) : (
          <div className="space-y-1.5">
            {rbac.slice(0, 10).map((rule) => (
              <div
                key={`${rule.resource}-${rule.role}`}
                className="flex items-center gap-2.5 rounded-xl px-3 py-3 border border-white/5"
                style={{ background: "rgba(255,255,255,0.02)" }}
              >
                <Shield size={13} style={{ color: rule.effect === "allow" ? "#10b981" : "#ef4444", flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                    {rule.resource}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{rule.role}</div>
                </div>
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{
                    background: rule.effect === "allow" ? "var(--green-light)" : "var(--red-light)",
                    color: rule.effect === "allow" ? "var(--green-strong)" : "var(--red-strong)",
                  }}
                >
                  {rule.effect}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="inspector-divider" />

      <div className="inspector-section py-4">
        <div
          className="rounded-2xl p-4 flex items-center gap-3"
          style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.07), rgba(220,38,38,0.04))", border: "1px solid rgba(239,68,68,0.15)" }}
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)" }}
          >
            <Building2 size={16} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-bold" style={{ color: "#7f1d1d" }}>Administration panel</div>
            <div className="text-xs" style={{ color: "#991b1b" }}>Full system access</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
