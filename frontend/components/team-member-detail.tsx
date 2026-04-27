"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, KeyRound, UserX, UserCheck, Trash2, Mail } from "lucide-react";

export type TeamUser = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active?: boolean;
  email_verified?: boolean;
};

export type TeamProjectLite = {
  id: string;
  name: string;
  description?: string;
  status: string;
  start_date?: string;
  planned_end_date?: string;
  supervisor_user_id?: string;
  client_user_id?: string;
  latitude_center?: number;
  longitude_center?: number;
  geofence_radius_m?: number;
};

export const ROLE_COLORS: Record<string, string> = {
  owner: "#3b82f6",
  supervisor: "#0ea5e9",
  helper: "#f59e0b",
  client: "#10b981",
  admin: "#ef4444",
};

export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  supervisor: "Supervisor",
  helper: "Operator",
  client: "Client",
  admin: "Admin",
};

type TeamMemberDetailProps = {
  user: TeamUser;
  isSelf: boolean;
  token: string;
  projects?: TeamProjectLite[];
  canAssignProjects?: boolean;
  onBack: () => void;
  onChanged: () => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
  onProjectAssignmentChanged?: () => void | Promise<void>;
};

export function TeamMemberDetail({
  user,
  isSelf,
  token,
  projects = [],
  canAssignProjects = false,
  onBack,
  onChanged,
  onDeleted,
  onProjectAssignmentChanged,
}: TeamMemberDetailProps) {
  const [role, setRole] = useState(user.role);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState<null | "role" | "password" | "suspend" | "invite" | "delete">(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  async function callAdmin(path: string, init: RequestInit) {
    const res = await fetch(path, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? `HTTP ${res.status}`);
    }
    return res.json().catch(() => ({}));
  }

  async function handleSaveRole() {
    if (role === user.role) return;
    setBusy("role");
    try {
      await callAdmin(`/api/v1/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      toast.success("Role updated");
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setBusy(null);
    }
  }

  async function handleSetPassword() {
    if (newPassword.length < 12) {
      toast.error("Password must be at least 12 characters");
      return;
    }
    setBusy("password");
    try {
      await callAdmin(`/api/v1/users/${user.id}/set-password`, {
        method: "POST",
        body: JSON.stringify({ password: newPassword }),
      });
      toast.success(`Password updated for ${user.email}`);
      setNewPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set password");
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleSuspend() {
    const nextActive = !(user.is_active ?? true);
    setBusy("suspend");
    try {
      await callAdmin(`/api/v1/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: nextActive }),
      });
      toast.success(nextActive ? "User reactivated" : "User suspended");
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setBusy(null);
    }
  }

  async function handleResendInvite() {
    setBusy("invite");
    try {
      const res = await fetch(`/api/v1/users/${user.id}/resend-invite`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to regenerate invite");
      toast.success("Invite regenerated — email sent to user.");
      if (data.invite_url) {
        try {
          await navigator.clipboard.writeText(data.invite_url);
          toast.success("Invite link copied to clipboard.");
        } catch {
          // Clipboard permission/focus failures must not mask the invite success.
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to regenerate invite");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    setBusy("delete");
    try {
      await callAdmin(`/api/v1/users/${user.id}`, { method: "DELETE" });
      toast.success(`${user.full_name || user.email} deleted`);
      await onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setBusy(null);
    }
  }

  const isActive = user.is_active ?? true;

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
        style={{ color: "var(--text-secondary)" }}
      >
        <ArrowLeft size={14} /> Back to team list
      </button>

      <div className="flex items-center gap-4">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold text-white"
          style={{ background: ROLE_COLORS[user.role] ?? "#6b7280" }}
        >
          {user.full_name?.[0] ?? user.email[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold truncate" style={{ color: "var(--text-primary)" }}>
            {user.full_name || user.email}
            {!isActive && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-red-600">Suspended</span>}
            {isSelf && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-blue-600">You</span>}
          </div>
          <div className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>{user.email}</div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Role</label>
        <div className="flex gap-2">
          <select
            className="form-select flex-1"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={isSelf}
          >
            <option value="owner">Owner</option>
            <option value="supervisor">Supervisor</option>
            <option value="helper">Operator</option>
            <option value="client">Client</option>
          </select>
          <button
            type="button"
            onClick={handleSaveRole}
            disabled={isSelf || busy !== null || role === user.role}
            className="btn-primary px-4 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy === "role" ? <Loader2 size={14} className="animate-spin" /> : "Save"}
          </button>
        </div>
        {isSelf && <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>You cannot change your own role.</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
          <KeyRound size={12} /> Set new password
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            className="form-input flex-1"
            placeholder="At least 12 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={handleSetPassword}
            disabled={busy !== null || newPassword.length < 12}
            className="btn-primary px-4 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy === "password" ? <Loader2 size={14} className="animate-spin" /> : "Update"}
          </button>
        </div>
        <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          The user will need to sign in again with the new password. Share it over a secure channel.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleToggleSuspend}
          disabled={busy !== null || isSelf}
          className="flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: isActive ? "rgba(245, 158, 11, 0.1)" : "rgba(16, 185, 129, 0.1)",
            color: isActive ? "#d97706" : "#059669",
            border: `1px solid ${isActive ? "rgba(245, 158, 11, 0.2)" : "rgba(16, 185, 129, 0.2)"}`,
          }}
        >
          {busy === "suspend" ? <Loader2 size={14} className="animate-spin" /> : isActive ? <UserX size={14} /> : <UserCheck size={14} />}
          {isActive ? "Suspend" : "Reactivate"}
        </button>
        <button
          type="button"
          onClick={handleResendInvite}
          disabled={busy !== null}
          className="flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: "color-mix(in srgb, var(--accent-blue) 10%, transparent)",
            color: "var(--accent-blue)",
            border: "1px solid color-mix(in srgb, var(--accent-blue) 20%, transparent)",
          }}
        >
          {busy === "invite" ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
          Regenerate invite link
        </button>
      </div>

      {canAssignProjects && user.role !== "owner" && user.role !== "admin" && (
        <ProjectAssignmentsSection
          user={user}
          projects={projects}
          token={token}
          onChanged={async () => { await onProjectAssignmentChanged?.(); }}
        />
      )}

      <div className="rounded-xl p-4 space-y-3" style={{ border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.1)" }}>
        <div className="text-sm font-semibold text-red-400 flex items-center gap-2">
          <Trash2 size={14} /> Delete user
        </div>
        <div className="text-xs text-red-300">
          This user will lose access immediately. Projects they created stay, but the account is archived.
        </div>
        {deleteConfirm ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy !== null || isSelf}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-600 text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {busy === "delete" && <Loader2 size={12} className="animate-spin" />}
              Yes, delete
            </button>
            <button
              type="button"
              onClick={() => setDeleteConfirm(false)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border text-white/70"
              style={{ background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.15)" }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDeleteConfirm(true)}
            disabled={isSelf}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--red-light)", color: "var(--red-strong)", border: "none" }}
          >
            Delete user
          </button>
        )}
        {isSelf && <p className="text-[11px] text-red-400">You cannot delete yourself.</p>}
      </div>
    </div>
  );
}

type ProjectAssignmentsSectionProps = {
  user: TeamUser;
  projects: TeamProjectLite[];
  token: string;
  onChanged: () => void | Promise<void>;
};

export function ProjectAssignmentsSection({
  user,
  projects,
  token,
  onChanged,
}: ProjectAssignmentsSectionProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const field = user.role === "client" ? "client_user_id" : user.role === "supervisor" ? "supervisor_user_id" : null;

  const assignedProjects = field ? projects.filter((p) => (p as any)[field] === user.id) : [];
  const availableProjects = field ? projects.filter((p) => (p as any)[field] !== user.id && p.status !== "archived") : [];

  async function patchProject(projectID: string, patch: Record<string, any>) {
    const res = await fetch(`/api/v1/projects/${projectID}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  }

  function buildPayload(project: TeamProjectLite, supervisorID: string, clientID: string) {
    return {
      name: project.name,
      description: project.description ?? "",
      status: project.status,
      start_date: project.start_date ?? "",
      planned_end_date: project.planned_end_date ?? "",
      supervisor_user_id: supervisorID,
      client_user_id: clientID,
      latitude_center: project.latitude_center ?? 0,
      longitude_center: project.longitude_center ?? 0,
      geofence_radius_m: project.geofence_radius_m ?? 0,
    };
  }

  async function assign(project: TeamProjectLite) {
    if (!field) return;
    setBusyId(project.id);
    try {
      const supervisorID = field === "supervisor_user_id" ? user.id : (project.supervisor_user_id ?? "");
      const clientID = field === "client_user_id" ? user.id : (project.client_user_id ?? "");
      await patchProject(project.id, buildPayload(project, supervisorID, clientID));
      toast.success(`Assigned to ${project.name}`);
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign");
    } finally {
      setBusyId(null);
    }
  }

  async function unassign(project: TeamProjectLite) {
    if (!field) return;
    setBusyId(project.id);
    try {
      const supervisorID = field === "supervisor_user_id" ? "" : (project.supervisor_user_id ?? "");
      const clientID = field === "client_user_id" ? "" : (project.client_user_id ?? "");
      await patchProject(project.id, buildPayload(project, supervisorID, clientID));
      toast.success(`Removed from ${project.name}`);
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unassign");
    } finally {
      setBusyId(null);
    }
  }

  if (user.role === "helper") {
    return (
      <div className="rounded-xl p-4 space-y-2" style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }}>
        <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Project access
        </div>
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Operators access projects indirectly — assign them to a task in the project to grant visibility.
        </p>
      </div>
    );
  }

  if (!field) return null;

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }}>
      <div className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
        Project assignments
      </div>
      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        {user.role === "client"
          ? "Projects where this client can see deliverables and approve evidence."
          : "Projects this supervisor leads."}
      </p>

      {assignedProjects.length === 0 ? (
        <div className="text-xs italic" style={{ color: "var(--text-tertiary)" }}>
          Not assigned to any project yet.
        </div>
      ) : (
        <div className="space-y-1.5">
          {assignedProjects.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div className="text-xs font-medium truncate flex-1" style={{ color: "var(--text-primary)" }}>
                {p.name}
              </div>
              <button
                type="button"
                onClick={() => void unassign(p)}
                disabled={busyId !== null}
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md disabled:opacity-40"
                style={{ color: "#ef4444", background: "rgba(239,68,68,0.1)" }}
              >
                {busyId === p.id ? <Loader2 size={10} className="animate-spin" /> : "Remove"}
              </button>
            </div>
          ))}
        </div>
      )}

      {availableProjects.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
            Add to project
          </div>
          {availableProjects.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="text-xs font-medium truncate flex-1" style={{ color: "var(--text-secondary)" }}>
                {p.name}
                {(p as any)[field] && (p as any)[field] !== user.id && (
                  <span className="ml-2 text-[10px] text-amber-400">(replaces current {user.role})</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => void assign(p)}
                disabled={busyId !== null}
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md disabled:opacity-40"
                style={{ color: "var(--accent-blue)", background: "color-mix(in srgb, var(--accent-blue) 10%, transparent)" }}
              >
                {busyId === p.id ? <Loader2 size={10} className="animate-spin" /> : "Add"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
