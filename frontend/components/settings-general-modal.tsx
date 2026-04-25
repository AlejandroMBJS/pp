"use client";

import { X, Building2, Bell, Shield, Globe, ChevronRight, Users, Loader2, Upload, ImageIcon, Palette, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { HexColorPicker, HexColorInput } from "react-colorful";
import { TeamMemberDetail, type TeamUser as User, type TeamProjectLite as ProjectLite } from "./team-member-detail";

type TenantSettings = {
  id: string;
  name: string;
  slug: string;
  website: string;
  country: string;
  timezone: string;
  currency: string;
  industry: string;
  public_dashboard_enabled: boolean;
  public_gallery_enabled: boolean;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
};

const DEFAULT_PRIMARY = "#3b82f6";
const DEFAULT_SECONDARY = "#8b5cf6";

const INDUSTRY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "generic",       label: "Generic / other" },
  { value: "construction",  label: "Construction" },
  { value: "manufacturing", label: "Manufacturing / CNC" },
  { value: "field_service", label: "Field service" },
  { value: "facilities",    label: "Facilities / maintenance" },
];

type SettingsGeneralModalProps = {
  open: boolean;
  onClose: () => void;
  companyName?: string;
  userCount?: number;
  users?: User[];
  currentUserId?: string;
  currentUserRole?: string;
  token?: string;
  projects?: ProjectLite[];
  onUsersChanged?: () => void | Promise<void>;
  onTenantUpdated?: (t: { id: string; name: string; slug: string; logo_url: string; primary_color?: string; secondary_color?: string }) => void;
  onProjectAssignmentChanged?: () => void | Promise<void>;
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
  projects = [],
  onUsersChanged,
  onTenantUpdated,
  onProjectAssignmentChanged,
}: SettingsGeneralModalProps) {
  const [activeTab, setActiveTab] = useState("company");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean> | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const [tenant, setTenant] = useState<TenantSettings | null>(null);
  const [tenantDraft, setTenantDraft] = useState<TenantSettings | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantSaving, setTenantSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [deleteSlugInput, setDeleteSlugInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);

  const openBillingPortal = async () => {
    if (!token) return;
    setOpeningPortal(true);
    try {
      const res = await fetch("/api/v1/billing/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? "Billing portal unavailable");
      }
      const data = await res.json();
      if (data.portal_url) {
        window.location.href = data.portal_url;
      } else {
        throw new Error("Billing portal unavailable");
      }
    } catch (e) {
      toast.error((e as Error).message || "Billing portal unavailable");
      setOpeningPortal(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setTenant(null);
      setTenantDraft(null);
      setDeleteSlugInput("");
      // F16: also clear loading flag when the modal closes mid-fetch so the
      // spinner doesn't stick on next open.
      setTenantLoading(false);
      return;
    }
    if (!token || tenant) return;
    let cancelled = false;
    setTenantLoading(true);
    fetch("/api/v1/tenants/current", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data: TenantSettings) => {
        if (!cancelled && data?.id) {
          setTenant(data);
          setTenantDraft(data);
        }
      })
      .catch(() => { if (!cancelled) toast.error("Could not load company settings"); })
      .finally(() => { if (!cancelled) setTenantLoading(false); });
    return () => { cancelled = true; };
  }, [open, token, tenant]);

  const tenantDirty = !!(tenant && tenantDraft) && JSON.stringify(tenant) !== JSON.stringify(tenantDraft);

  const saveTenant = async () => {
    if (!tenantDraft || !token || !tenantDirty) return;
    setTenantSaving(true);
    try {
      const res = await fetch("/api/v1/tenants/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: tenantDraft.name,
          website: tenantDraft.website,
          country: tenantDraft.country,
          timezone: tenantDraft.timezone,
          currency: tenantDraft.currency,
          public_dashboard_enabled: tenantDraft.public_dashboard_enabled,
          public_gallery_enabled: tenantDraft.public_gallery_enabled,
          logo_url: tenantDraft.logo_url,
          primary_color: tenantDraft.primary_color,
          secondary_color: tenantDraft.secondary_color,
          industry: tenantDraft.industry,
        }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? `HTTP ${res.status}`);
      const updated: TenantSettings = await res.json();
      setTenant(updated);
      setTenantDraft(updated);
      onTenantUpdated?.(updated);
      toast.success("Company settings saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTenantSaving(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (!token) return;
    setLogoUploading(true);
    try {
      // Phase 1: request upload URL
      const urlRes = await fetch("/api/v1/tenants/current/logo/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ file_name: file.name, content_type: file.type, file_size_bytes: file.size }),
      });
      if (!urlRes.ok) throw new Error((await urlRes.json())?.error ?? `HTTP ${urlRes.status}`);
      const { id: sessionId, upload_url } = await urlRes.json();

      // Phase 2: PUT file — use pathname only to avoid cross-origin issues
      const safeUrl = (() => { try { return new URL(upload_url).pathname + "?" + new URL(upload_url).searchParams.toString(); } catch { return upload_url; } })();
      const putRes = await fetch(safeUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putRes.ok) throw new Error(`Upload failed: HTTP ${putRes.status}`);

      // Phase 3: confirm
      const confirmRes = await fetch("/api/v1/tenants/current/logo/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ upload_session_id: sessionId }),
      });
      if (!confirmRes.ok) throw new Error((await confirmRes.json())?.error ?? `HTTP ${confirmRes.status}`);
      const updated: TenantSettings = await confirmRes.json();
      setTenant(updated);
      setTenantDraft(updated);
      onTenantUpdated?.(updated);
      toast.success("Logo updated");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!token) return;
    setLogoUploading(true);
    try {
      const res = await fetch("/api/v1/tenants/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ logo_url: "" }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? `HTTP ${res.status}`);
      const updated: TenantSettings = await res.json();
      setTenant(updated);
      setTenantDraft(updated);
      onTenantUpdated?.(updated);
      toast.success("Logo removed");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLogoUploading(false);
    }
  };

  const deleteTenant = async () => {
    if (!token || !tenant) return;
    if (deleteSlugInput !== tenant.slug) {
      toast.error("Slug does not match");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/v1/tenants/current", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirm_slug: deleteSlugInput }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? `HTTP ${res.status}`);
      toast.success("Company deleted. Signing out…");
      setTimeout(() => { window.location.href = "/"; }, 1500);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

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
          style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}
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
              {tenantLoading && !tenantDraft ? (
                <div className="flex items-center justify-center py-10 text-sm text-white/40">
                  <Loader2 size={16} className="animate-spin mr-2" /> Loading company settings…
                </div>
              ) : !tenantDraft ? (
                <div className="text-sm text-white/40 py-10 text-center">Could not load company settings.</div>
              ) : (
                <>
                  <SectionLabel>Company identity</SectionLabel>
                  <div className="flex items-center gap-4">
                    <div className="relative flex-shrink-0 group">
                      {tenantDraft.logo_url ? (
                        <img
                          src={tenantDraft.logo_url}
                          alt=""
                          className="h-16 w-16 rounded-2xl object-cover border border-white/10"
                        />
                      ) : (
                        <div
                          className="flex h-16 w-16 items-center justify-center rounded-2xl text-white font-bold text-xl"
                          style={{ background: "linear-gradient(135deg, #3b82f6, #0ea5e9)" }}
                        >
                          {tenantDraft.name[0] ?? "?"}
                        </div>
                      )}
                      {canManageUsers && (
                        <label
                          className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        >
                          {logoUploading ? (
                            <Loader2 size={20} className="text-white animate-spin" />
                          ) : (
                            <Upload size={20} className="text-white" />
                          )}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/svg+xml,image/webp"
                            className="hidden"
                            disabled={logoUploading}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleLogoUpload(f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <SettingField
                        label="Company name"
                        value={tenantDraft.name}
                        onChange={(v) => setTenantDraft({ ...tenantDraft, name: v })}
                        disabled={!canManageUsers}
                      />
                      {canManageUsers && (
                        <div className="flex items-center gap-2">
                          <label
                            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)" }}
                          >
                            <ImageIcon size={12} />
                            {tenantDraft.logo_url ? "Change logo" : "Upload logo"}
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/svg+xml,image/webp"
                              className="hidden"
                              disabled={logoUploading}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleLogoUpload(f);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          {tenantDraft.logo_url && (
                            <button
                              type="button"
                              onClick={handleRemoveLogo}
                              disabled={logoUploading}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors text-red-400 hover:text-red-300"
                              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <SettingField
                    label="Website"
                    type="url"
                    value={tenantDraft.website}
                    placeholder="https://your-domain.com"
                    onChange={(v) => setTenantDraft({ ...tenantDraft, website: v })}
                    disabled={!canManageUsers}
                  />
                  <SettingField
                    label="Country / Region"
                    value={tenantDraft.country}
                    onChange={(v) => setTenantDraft({ ...tenantDraft, country: v })}
                    disabled={!canManageUsers}
                  />

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                      Industry
                    </label>
                    <select
                      className="form-select"
                      disabled={!canManageUsers}
                      value={tenantDraft.industry || "generic"}
                      onChange={(e) => setTenantDraft({ ...tenantDraft, industry: e.target.value })}
                    >
                      {INDUSTRY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                      Tailors the daily-log sections (weather, crew, shifts, QC…) to your operation.
                    </p>
                  </div>

                  <SectionLabel>Brand colors</SectionLabel>
                  <div className="text-xs -mt-2" style={{ color: "var(--text-tertiary)" }}>
                    Used across the app — headers, buttons and accents. Click a swatch to open the picker.
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <BrandColorPicker
                      label="Primary"
                      value={tenantDraft.primary_color}
                      fallback={DEFAULT_PRIMARY}
                      onChange={(v) => setTenantDraft({ ...tenantDraft, primary_color: v })}
                      disabled={!canManageUsers}
                    />
                    <BrandColorPicker
                      label="Secondary"
                      value={tenantDraft.secondary_color}
                      fallback={DEFAULT_SECONDARY}
                      onChange={(v) => setTenantDraft({ ...tenantDraft, secondary_color: v })}
                      disabled={!canManageUsers}
                    />
                  </div>
                  <div
                    className="rounded-2xl p-4 border border-white/10"
                    style={{
                      background: `linear-gradient(135deg, ${tenantDraft.primary_color || DEFAULT_PRIMARY}, ${tenantDraft.secondary_color || DEFAULT_SECONDARY})`,
                    }}
                  >
                    <div className="text-xs font-black uppercase tracking-widest text-white/80">Live preview</div>
                    <div className="text-base font-bold text-white mt-1">{tenantDraft.name || "Your brand"}</div>
                  </div>

                  <SectionLabel>Timezone and currency</SectionLabel>
                  <div className="grid grid-cols-2 gap-3">
                    <SettingFieldSelect
                      label="Timezone"
                      options={["UTC", "America/Mexico_City", "America/Monterrey", "America/New_York", "America/Los_Angeles", "Europe/Madrid"]}
                      value={tenantDraft.timezone}
                      onChange={(v) => setTenantDraft({ ...tenantDraft, timezone: v })}
                      disabled={!canManageUsers}
                    />
                    <SettingFieldSelect
                      label="Currency"
                      options={["USD", "MXN", "EUR", "GBP", "CAD"]}
                      value={tenantDraft.currency}
                      onChange={(v) => setTenantDraft({ ...tenantDraft, currency: v })}
                      disabled={!canManageUsers}
                    />
                  </div>

                  <SectionLabel>Public portal</SectionLabel>
                  <SettingToggle
                    label="Show public dashboard"
                    description="Allows viewing key metrics without signing in."
                    on={tenantDraft.public_dashboard_enabled}
                    onChange={() => setTenantDraft({ ...tenantDraft, public_dashboard_enabled: !tenantDraft.public_dashboard_enabled })}
                    disabled={!canManageUsers}
                  />
                  <SettingToggle
                    label="Public project gallery"
                    description="Clients can view the gallery without an account."
                    on={tenantDraft.public_gallery_enabled}
                    onChange={() => setTenantDraft({ ...tenantDraft, public_gallery_enabled: !tenantDraft.public_gallery_enabled })}
                    disabled={!canManageUsers}
                  />

                  {canManageUsers && (
                    <>
                      <SectionLabel>Billing</SectionLabel>
                      <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-white/10 bg-white/5">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-white">Manage subscription</div>
                          <div className="text-xs text-white/50 mt-0.5">
                            Update payment method, download invoices, or cancel your plan.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={openBillingPortal}
                          disabled={openingPortal}
                          className="px-4 py-2 rounded-xl bg-white/10 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-2 flex-shrink-0 hover:bg-white/15 transition-colors border border-white/10"
                        >
                          {openingPortal ? (
                            <>
                              <Loader2 size={12} className="animate-spin" /> Opening…
                            </>
                          ) : (
                            "Open portal"
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
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
                <div className="rounded-xl px-4 py-3 text-xs" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-tertiary)" }}>
                  Only owners and platform admins can manage team members. You can see the list but not edit.
                </div>
              )}
              {users.length === 0 ? (
                <div
                  className="rounded-xl px-4 py-8 text-center text-sm"
                  style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-tertiary)" }}
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
                        className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors text-left ${clickable ? "hover:bg-white/10 cursor-pointer" : "cursor-default opacity-80"}`}
                        style={{ border: "1px solid rgba(255,255,255,0.1)" }}
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
              projects={projects}
              canAssignProjects={currentUserRole === "owner" || currentUserRole === "admin"}
              onBack={() => setSelectedUserId(null)}
              onChanged={async () => {
                await onUsersChanged?.();
              }}
              onDeleted={async () => {
                await onUsersChanged?.();
                setSelectedUserId(null);
              }}
              onProjectAssignmentChanged={async () => {
                await onProjectAssignmentChanged?.();
              }}
            />
          )}

          {activeTab === "notifs" && (
            <div className="space-y-4">
              {notifLoading && !notifPrefs ? (
                <div className="flex items-center justify-center py-8 text-sm text-white/40">
                  <Loader2 size={16} className="animate-spin mr-2" /> Loading preferences…
                </div>
              ) : !notifPrefs ? (
                <div className="text-sm text-white/40 py-8 text-center">Could not load preferences.</div>
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
              <SectionLabel>Change your password</SectionLabel>
              <SelfPasswordChange token={token ?? ""} />
              <SectionLabel className="text-red-600">Danger zone</SectionLabel>
              <div className="rounded-xl p-4 space-y-3" style={{ border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.1)" }}>
                <div className="text-sm font-semibold text-red-400">Delete company</div>
                <div className="text-xs text-red-300">
                  This action is irreversible. All projects, evidence, and users will be permanently deleted. Type the company slug{tenant?.slug ? <> <strong>{tenant.slug}</strong></> : ""} to confirm.
                </div>
                <input
                  type="text"
                  placeholder={tenant?.slug ?? "company-slug"}
                  value={deleteSlugInput}
                  onChange={(e) => setDeleteSlugInput(e.target.value)}
                  disabled={!canManageUsers || !tenant}
                  className="form-input"
                  style={{ borderColor: "rgba(239,68,68,0.3)" }}
                />
                <button
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{
                    background: "var(--red-light)",
                    color: "var(--red-strong)",
                    border: "none",
                    cursor: !canManageUsers || deleting || !tenant || deleteSlugInput !== tenant?.slug ? "not-allowed" : "pointer",
                    opacity: !canManageUsers || deleting || !tenant || deleteSlugInput !== tenant?.slug ? 0.5 : 1,
                  }}
                  disabled={!canManageUsers || deleting || !tenant || deleteSlugInput !== tenant?.slug}
                  onClick={deleteTenant}
                >
                  {deleting ? "Deleting…" : "Permanently delete company"}
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
            className="btn-primary"
            disabled={!tenantDirty || tenantSaving || !canManageUsers}
            style={{
              opacity: !tenantDirty || tenantSaving || !canManageUsers ? 0.5 : 1,
              cursor: !tenantDirty || tenantSaving || !canManageUsers ? "not-allowed" : "pointer",
            }}
            onClick={saveTenant}
          >
            {tenantSaving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────


function SelfPasswordChange({ token }: { token: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit =
    token &&
    !busy &&
    currentPassword.length > 0 &&
    newPassword.length >= 12 &&
    newPassword === confirmPassword;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const res = await fetch("/api/v1/me/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data?.error === "string" ? data.error : `HTTP ${res.status}`,
        );
      }
      toast.success("Contraseña actualizada.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo cambiar la contraseña.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{
        border: "1px solid var(--glass-border)",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div className="space-y-1.5">
        <label
          className="text-xs font-semibold"
          style={{ color: "var(--text-secondary)" }}
        >
          Current password
        </label>
        <input
          type="password"
          className="form-input w-full"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="Your current password"
        />
      </div>
      <div className="space-y-1.5">
        <label
          className="text-xs font-semibold"
          style={{ color: "var(--text-secondary)" }}
        >
          New password
        </label>
        <input
          type="password"
          className="form-input w-full"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="At least 12 characters"
        />
      </div>
      <div className="space-y-1.5">
        <label
          className="text-xs font-semibold"
          style={{ color: "var(--text-secondary)" }}
        >
          Confirm new password
        </label>
        <input
          type="password"
          className="form-input w-full"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="Repeat the new password"
        />
        {confirmPassword.length > 0 && confirmPassword !== newPassword && (
          <p className="text-[11px] text-red-400">Passwords do not match.</p>
        )}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="btn-primary px-4 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          Update password
        </button>
      </div>
    </div>
  );
}

function BrandColorPicker({
  label,
  value,
  fallback,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const displayed = value || fallback;
  const isCustom = value !== "";
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
        <Palette size={12} />
        {label}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => !disabled && setOpen((v) => !v)}
          disabled={disabled}
          className="h-10 w-10 rounded-xl border border-white/15 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed transition-transform hover:scale-105"
          style={{ background: displayed }}
          aria-label={`Pick ${label.toLowerCase()} color`}
        />
        <div className="flex-1 min-w-0">
          <HexColorInput
            color={displayed}
            onChange={(c) => onChange(c)}
            prefixed
            disabled={disabled}
            className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm font-mono text-white outline-none focus:border-white/25 disabled:opacity-50 uppercase"
            aria-label={`${label} hex value`}
          />
        </div>
        {isCustom && !disabled && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors flex-shrink-0"
            title="Reset to default"
            aria-label="Reset to default"
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>
      {open && !disabled && (
        <div className="relative">
          <div
            className="absolute z-20 mt-1 p-3 rounded-2xl border border-white/15 shadow-xl"
            style={{ background: "var(--glass-bg, rgba(20,20,30,0.95))", backdropFilter: "blur(20px)" }}
          >
            <HexColorPicker color={displayed} onChange={(c) => onChange(c)} />
            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-bold uppercase tracking-widest"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
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
  value,
  onChange,
  type = "text",
  placeholder,
  disabled = false,
}: {
  label: string;
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const controlled = value !== undefined;
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
        {label}
      </label>
      <input
        type={type}
        {...(controlled ? { value, onChange: (e) => onChange?.(e.target.value) } : { defaultValue })}
        placeholder={placeholder}
        disabled={disabled}
        className="form-input"
      />
    </div>
  );
}

function SettingFieldSelect({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: string[];
  value?: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
}) {
  const controlled = value !== undefined;
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
        {label}
      </label>
      <select
        className="form-select"
        disabled={disabled}
        {...(controlled ? { value, onChange: (e) => onChange?.(e.target.value) } : {})}
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
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
      className={`flex items-center justify-between gap-4 rounded-xl px-4 py-3 transition-colors ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-white/10"}`}
      style={{ border: "1px solid rgba(255,255,255,0.1)" }}
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

