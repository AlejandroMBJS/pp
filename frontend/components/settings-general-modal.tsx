"use client";

import { X, Building2, Bell, Shield, Globe, ChevronRight, Users, ArrowLeft, Loader2, KeyRound, UserX, UserCheck, Trash2, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type User = { id: string; email: string; full_name: string; role: string; is_active?: boolean; email_verified?: boolean };

type SettingsGeneralModalProps = {
  open: boolean;
  onClose: () => void;
  companyName?: string;
  userCount?: number;
  users?: User[];
  currentUserId?: string;
  currentUserRole?: string;
  token?: string;
  onUsersChanged?: () => void | Promise<void>;
};

const tabs = [
  { id: "company",  label: "Company",        icon: Building2 },
  { id: "team",     label: "Team",           icon: Users },
  { id: "notifs",   label: "Notifications",  icon: Bell },
  { id: "security", label: "Security",       icon: Shield },
];

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
  helper:     "Operator",
  client:     "Client",
  admin:      "Admin",
};

export function SettingsGeneralModal({
  open,
  onClose,
  companyName = "My Company",
  userCount = 0,
  users = [],
  currentUserId,
  currentUserRole,
  token,
  onUsersChanged,
}: SettingsGeneralModalProps) {
  const [activeTab, setActiveTab] = useState("company");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean> | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);

  useEffect(() => {
    if (!open || activeTab !== "notifs" || !token || notifPrefs) return;
    let cancelled = false;
    setNotifLoading(true);
    fetch("/api/v1/me/notifications", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.preferences) setNotifPrefs(data.preferences);
      })
      .catch(() => { if (!cancelled) toast.error("Could not load notification preferences"); })
      .finally(() => { if (!cancelled) setNotifLoading(false); });
    return () => { cancelled = true; };
  }, [open, activeTab, token, notifPrefs]);

  const toggleNotifPref = async (key: string) => {
    if (!notifPrefs || !token) return;
    const next = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(next);
    try {
      const res = await fetch("/api/v1/me/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ preferences: { [key]: next[key] } }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Preference saved");
    } catch {
      setNotifPrefs(notifPrefs);
      toast.error("Could not save preference");
    }
  };

  if (!open) return null;

  const canManageUsers = currentUserRole === "owner" || currentUserRole === "admin";
  const selectedUser = selectedUserId ? users.find((u) => u.id === selectedUserId) ?? null : null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet modal-sheet-wide" style={{ maxWidth: 680 }}>
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: "linear-gradient(135deg, #3b82f6, #0ea5e9)" }}
            >
              <Globe size={18} className="text-white" />
            </div>
            <div>
              <div className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                General Settings
              </div>
              <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {companyName}
              </div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Tab bar */}
        <div
          className="flex gap-1 px-6 pt-4 pb-0"
          style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-xl transition-all"
                style={{
                  color: active ? "#3b82f6" : "var(--text-secondary)",
                  borderBottom: active ? "2px solid #3b82f6" : "2px solid transparent",
                  background: active ? "rgba(59,130,246,0.06)" : "transparent",
                }}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="modal-body">
          {activeTab === "company" && (
            <div className="space-y-5">
              <SectionLabel>Company identity</SectionLabel>
              <div className="flex items-center gap-4">
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-2xl text-white font-bold text-xl flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #3b82f6, #0ea5e9)" }}
                >
                  {companyName[0]}
                </div>
                <div className="flex-1">
                  <SettingField label="Company name" defaultValue={companyName} />
                </div>
              </div>
              <SettingField label="Website" defaultValue="https://projectpulse.app" type="url" />
              <SettingField label="Country / Region" defaultValue="Mexico" />

              <SectionLabel>Timezone and currency</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                <SettingFieldSelect label="Timezone" options={["America/Mexico_City", "America/Monterrey", "UTC"]} />
                <SettingFieldSelect label="Currency" options={["MXN — Mexican Peso", "USD — Dollar", "EUR — Euro"]} />
              </div>

              <SectionLabel>Public portal</SectionLabel>
              <SettingToggle label="Show public dashboard" description="Allows viewing key metrics without signing in." defaultOn />
              <SettingToggle label="Public project gallery" description="Clients can view the gallery without an account." />
            </div>
          )}

          {activeTab === "team" && !selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                 <SectionLabel>Team members</SectionLabel>
                <span
                  className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: "var(--blue-light)", color: "var(--blue-strong)" }}
                >
                  {userCount} users
                </span>
              </div>
              {!canManageUsers && (
                <div className="rounded-xl px-4 py-3 text-xs" style={{ background: "rgba(0,0,0,0.03)", color: "var(--text-tertiary)" }}>
                  Only owners and platform admins can manage team members. You can see the list but not edit.
                </div>
              )}
              {users.length === 0 ? (
                <div
                  className="rounded-xl px-4 py-8 text-center text-sm"
                  style={{ background: "rgba(0,0,0,0.03)", color: "var(--text-tertiary)" }}
                >
                  No users registered yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {users.map((u) => {
                    const clickable = canManageUsers;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => clickable && setSelectedUserId(u.id)}
                        disabled={!clickable}
                        className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors text-left ${clickable ? "hover:bg-gray-50 cursor-pointer" : "cursor-default opacity-80"}`}
                        style={{ border: "1px solid rgba(0,0,0,0.06)" }}
                      >
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white flex-shrink-0"
                          style={{ background: roleColors[u.role] ?? "#6b7280" }}
                        >
                          {u.full_name?.[0] ?? u.email[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                            {u.full_name || u.email}
                            {u.is_active === false && (
                              <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-red-600">Suspended</span>
                            )}
                          </div>
                          <div className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
                            {u.email}
                          </div>
                        </div>
                        <span
                          className="text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0"
                          style={{ background: `${roleColors[u.role]}18`, color: roleColors[u.role] ?? "#6b7280" }}
                        >
                          {roleLabels[u.role] ?? u.role}
                        </span>
                        <ChevronRight size={14} style={{ color: "var(--text-tertiary)" }} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "team" && selectedUser && (
            <TeamMemberDetail
              user={selectedUser}
              isSelf={selectedUser.id === currentUserId}
              token={token ?? ""}
              onBack={() => setSelectedUserId(null)}
              onChanged={async () => {
                await onUsersChanged?.();
              }}
              onDeleted={async () => {
                await onUsersChanged?.();
                setSelectedUserId(null);
              }}
            />
          )}

          {activeTab === "notifs" && (
            <div className="space-y-4">
              {notifLoading && !notifPrefs ? (
                <div className="flex items-center justify-center py-8 text-sm text-gray-500">
                  <Loader2 size={16} className="animate-spin mr-2" /> Loading preferences…
                </div>
              ) : !notifPrefs ? (
                <div className="text-sm text-gray-500 py-8 text-center">Could not load preferences.</div>
              ) : (
                <>
                  <SectionLabel>Platform alerts</SectionLabel>
                  <SettingToggle label="Evidence pending approval" description="Notify when an operator uploads evidence." on={notifPrefs.evidence_pending} onChange={() => toggleNotifPref("evidence_pending")} />
                  <SettingToggle label="Task nearing due date" description="Alert 2 days before deadline." on={notifPrefs.task_due} onChange={() => toggleNotifPref("task_due")} />
                  <SettingToggle label="Deliverable approved" description="Notify when a client opens an approved deliverable." on={notifPrefs.deliverable_approved} onChange={() => toggleNotifPref("deliverable_approved")} />
                  <SettingToggle label="Budget at 80%" description="Alert when the project reaches 80% of budget consumption." on={notifPrefs.budget_alert} onChange={() => toggleNotifPref("budget_alert")} />

                  <SectionLabel>Email</SectionLabel>
                  <SettingToggle label="Weekly executive summary" description="Metrics digest every Monday." on={notifPrefs.weekly_summary} onChange={() => toggleNotifPref("weekly_summary")} />
                  <SettingToggle label="Critical email alerts" description="Only high-priority events." on={notifPrefs.critical_alerts} onChange={() => toggleNotifPref("critical_alerts")} />
                </>
              )}
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-4">
              <SectionLabel>Authentication</SectionLabel>
              <SettingToggle label="Two-factor authentication" description="Coming soon — require 2FA for all users." disabled />
              <SettingToggle label="Enterprise SSO" description="Coming soon — Google Workspace / Okta." disabled />

              <SectionLabel>Sessions</SectionLabel>
              <SettingFieldSelect label="Session duration (coming soon)" options={["8 hours", "24 hours", "7 days", "30 days"]} />
              <SettingToggle label="Detect suspicious IPs" description="Coming soon — block sign-ins from unusual locations." disabled />

              <SectionLabel className="text-red-600">Danger zone</SectionLabel>
              <div className="rounded-xl border border-red-100 bg-red-50 p-4 space-y-3">
                 <div className="text-sm font-semibold text-red-700">Delete company</div>
                <div className="text-xs text-red-600">
                  This action is irreversible. All projects, evidence, and users will be permanently deleted.
                </div>
                <button
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: "var(--red-light)", color: "var(--red-strong)", border: "none", cursor: "pointer" }}
                >
                  Request account deletion
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary opacity-50 cursor-not-allowed"
            title="Company settings persistence is not yet available in this demo."
            onClick={() => toast.info("La configuración de empresa es solo lectura en este demo.")}
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

type TeamMemberDetailProps = {
  user: User;
  isSelf: boolean;
  token: string;
  onBack: () => void;
  onChanged: () => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
};

function TeamMemberDetail({ user, isSelf, token, onBack, onChanged, onDeleted }: TeamMemberDetailProps) {
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
      await callAdmin(`/api/v1/users/${user.id}/resend-invite`, { method: "POST" });
      toast.success(`Invite re-sent to ${user.email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resend invite");
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
          style={{ background: roleColors[user.role] ?? "#6b7280" }}
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
            background: "rgba(59, 130, 246, 0.1)",
            color: "#2563eb",
            border: "1px solid rgba(59, 130, 246, 0.2)",
          }}
        >
          {busy === "invite" ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
          Resend invite
        </button>
      </div>

      <div className="rounded-xl border border-red-100 bg-red-50 p-4 space-y-3">
        <div className="text-sm font-semibold text-red-700 flex items-center gap-2">
          <Trash2 size={14} /> Delete user
        </div>
        <div className="text-xs text-red-600">
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
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-700"
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
        {isSelf && <p className="text-[11px] text-red-600">You cannot delete yourself.</p>}
      </div>
    </div>
  );
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`text-xs font-bold uppercase tracking-widest ${className}`}
      style={{ color: "var(--text-tertiary)" }}
    >
      {children}
    </div>
  );
}

function SettingField({
  label,
  defaultValue = "",
  type = "text",
}: {
  label: string;
  defaultValue?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
        {label}
      </label>
      <input
        type={type}
        defaultValue={defaultValue}
        className="form-input"
      />
    </div>
  );
}

function SettingFieldSelect({ label, options }: { label: string; options: string[] }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
        {label}
      </label>
      <select className="form-select">
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

function SettingToggle({
  label,
  description,
  defaultOn = false,
  on: controlledOn,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  defaultOn?: boolean;
  on?: boolean;
  onChange?: () => void;
  disabled?: boolean;
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultOn);
  const on = controlledOn !== undefined ? controlledOn : uncontrolled;
  const handleClick = () => {
    if (disabled) return;
    if (onChange) onChange();
    else setUncontrolled((v) => !v);
  };
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-xl px-4 py-3 transition-colors ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-gray-50"}`}
      style={{ border: "1px solid rgba(0,0,0,0.06)" }}
      onClick={handleClick}
    >
      <div>
        <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {label}
        </div>
        {description && (
          <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
            {description}
          </div>
        )}
      </div>
      <div
        className="relative flex-shrink-0 w-11 h-6 rounded-full transition-all duration-200 cursor-pointer"
        style={{
          background: on ? "linear-gradient(90deg, #3b82f6, #0ea5e9)" : "#e5e7eb",
        }}
      >
        <div
          className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-200"
          style={{ left: on ? "calc(100% - 22px)" : "2px" }}
        />
      </div>
    </div>
  );
}
