"use client";

import { X, FolderKanban, MapPin, Users, DollarSign, Calendar, AlertTriangle, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

type Project = {
  id: string;
  name: string;
  description: string;
  status: string;
  budget_total_cents: number;
  spent_total_cents: number;
  start_date: string;
  planned_end_date: string;
  latitude_center: number;
  longitude_center: number;
  geofence_radius_m: number;
  supervisor_user_id?: string;
  client_user_id?: string;
};

type User = { id: string; full_name: string; email: string; role: string };

type SettingsProjectModalProps = {
  open: boolean;
  onClose: () => void;
  project: Project | null;
  supervisors?: User[];
  clients?: User[];
  token?: string;
  onSaved?: (updated: Project) => void;
};

const tabs = [
  { id: "general",  label: "General",     icon: FolderKanban },
  { id: "budget",   label: "Budget",      icon: DollarSign },
  { id: "team",     label: "Team",        icon: Users },
  { id: "geo",      label: "Geofence",    icon: MapPin },
];

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "MXN", maximumFractionDigits: 0,
  }).format((cents || 0) / 100);
}

function percent(spent: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.round((spent / total) * 100));
}

export function SettingsProjectModal({
  open,
  onClose,
  project,
  supervisors = [],
  clients = [],
  token,
  onSaved,
}: SettingsProjectModalProps) {
  const [activeTab, setActiveTab] = useState("general");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Project | null>(null);

  // Reset form when project changes
  useEffect(() => {
    if (project) setForm({ ...project });
  }, [project]);

  if (!open || !project || !form) return null;

  const budgetPct = percent(project.spent_total_cents, project.budget_total_cents);
  const barColor = budgetPct > 85 ? "#ef4444" : budgetPct > 65 ? "#f59e0b" : "#10b981";

  function set<K extends keyof Project>(key: K, value: Project[K]) {
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/projects/${form.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          status: form.status,
          start_date: form.start_date,
          planned_end_date: form.planned_end_date,
          supervisor_user_id: form.supervisor_user_id ?? "",
          client_user_id: form.client_user_id ?? "",
          latitude_center: Number(form.latitude_center),
          longitude_center: Number(form.longitude_center),
          geofence_radius_m: Number(form.geofence_radius_m),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      toast.success("Configuración del proyecto guardada.");
      onSaved?.(data as Project);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar el proyecto.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!form) return;
    if (!confirm(`¿Archivar el proyecto "${form.name}"?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/projects/${form.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ...form, status: "archived" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      toast.success("Proyecto archivado.");
      onSaved?.(data as Project);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo archivar el proyecto.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet" style={{ maxWidth: 580 }}>
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}
            >
              <FolderKanban size={18} className="text-white" />
            </div>
            <div>
              <div className="text-base font-bold truncate" style={{ color: "var(--text-primary)", maxWidth: 320 }}>
                {project.name}
              </div>
              <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                Project settings
              </div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 px-6 pt-3" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-t-xl transition-all"
                style={{
                  color: active ? "#10b981" : "var(--text-secondary)",
                  borderBottom: active ? "2px solid #10b981" : "2px solid transparent",
                  background: active ? "rgba(16,185,129,0.06)" : "transparent",
                }}
              >
                <Icon size={13} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="modal-body">
          {activeTab === "general" && (
            <div className="space-y-4">
              <Field label="Project name" value={form.name} onChange={(v) => set("name", v)} />
              <Field label="Description" value={form.description} onChange={(v) => set("description", v)} multiline />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start date" value={form.start_date} onChange={(v) => set("start_date", v)} type="date" />
                <Field label="End date" value={form.planned_end_date} onChange={(v) => set("planned_end_date", v)} type="date" />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
                  Status
                </label>
                <select className="form-select" value={form.status} onChange={(e) => set("status", e.target.value)}>
                  <option value="active">Active</option>
                  <option value="on_hold">On hold</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === "budget" && (
            <div className="space-y-5">
              {/* Budget visual */}
              <div
                className="rounded-2xl p-5 space-y-3"
                style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(5,150,105,0.04))", border: "1px solid rgba(16,185,129,0.15)" }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                       Total budget
                    </div>
                    <div className="text-2xl font-bold mt-0.5" style={{ color: "var(--text-primary)" }}>
                      {money(project.budget_total_cents)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                       Spent
                    </div>
                    <div className="text-2xl font-bold mt-0.5" style={{ color: barColor }}>
                      {money(project.spent_total_cents)}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${budgetPct}%`, background: barColor }} />
                  </div>
                  <div className="flex justify-between mt-1.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
                     <span>{budgetPct}% spent</span>
                     <span>Available: {money(project.budget_total_cents - project.spent_total_cents)}</span>
                  </div>
                </div>
              </div>
              <div
                className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
                style={{ background: "var(--amber-light)", color: "var(--amber-strong)" }}
              >
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                 <span>Adjust total budget from the Budget section. Spent is updated automatically from approved expenses.</span>
              </div>
            </div>
          )}

          {activeTab === "team" && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
                  Responsible supervisor
                </label>
                <select
                  className="form-select"
                  value={form.supervisor_user_id ?? ""}
                  onChange={(e) => set("supervisor_user_id", e.target.value)}
                >
                  <option value="">— Unassigned —</option>
                  {supervisors.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
                  Assigned client
                </label>
                <select
                  className="form-select"
                  value={form.client_user_id ?? ""}
                  onChange={(e) => set("client_user_id", e.target.value)}
                >
                  <option value="">— Unassigned —</option>
                  {clients.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name}</option>
                  ))}
                </select>
              </div>
              <div
                className="rounded-xl px-4 py-3 text-xs"
                style={{ background: "var(--blue-light)", color: "var(--blue-strong)" }}
              >
                Team changes take effect immediately. New members receive access right away.
              </div>
            </div>
          )}

          {activeTab === "geo" && (
            <div className="space-y-4">
              <div
                className="rounded-2xl p-4 flex items-start gap-3"
                style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)" }}
              >
                <MapPin size={16} className="flex-shrink-0 mt-0.5" style={{ color: "#10b981" }} />
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  Geofence limits where operators can upload field evidence.
                  Uploads outside the radius are automatically flagged as suspicious.
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Center latitude"
                  value={String(form.latitude_center)}
                  onChange={(v) => set("latitude_center", parseFloat(v) || 0)}
                  type="number"
                />
                <Field
                  label="Center longitude"
                  value={String(form.longitude_center)}
                  onChange={(v) => set("longitude_center", parseFloat(v) || 0)}
                  type="number"
                />
              </div>
              <Field
                label="Geofence radius (meters)"
                value={String(form.geofence_radius_m)}
                onChange={(v) => set("geofence_radius_m", parseInt(v) || 0)}
                type="number"
              />
              {/* Mini map placeholder */}
              <div
                className="rounded-xl overflow-hidden flex items-center justify-center"
                style={{ height: 140, background: "linear-gradient(135deg, #e0f2fe, #dbeafe)", border: "1px solid rgba(59,130,246,0.2)" }}
              >
                <div className="text-center space-y-1">
                  <MapPin size={28} style={{ color: "#3b82f6", margin: "0 auto" }} />
                  <div className="text-xs font-semibold" style={{ color: "#3b82f6" }}>
                    {Number(form.latitude_center).toFixed(4)}, {Number(form.longitude_center).toFixed(4)}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Radius: {form.geofence_radius_m}m</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer flex-col" style={{ gap: 0 }}>
          {/* Danger zone */}
          <div className="w-full mb-3">
            <button
              type="button"
              disabled={saving}
              onClick={handleArchive}
              className="w-full text-xs font-semibold py-2 rounded-xl transition-colors disabled:opacity-40"
              style={{ background: "var(--red-light)", color: "var(--red-strong)", border: "1px solid rgba(220,38,38,0.15)" }}
            >
               Archive project
            </button>
          </div>
          <div className="flex justify-end gap-2.5 w-full">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="button" className="btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? <><Loader2 size={14} className="animate-spin inline mr-1" />Saving...</> : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  multiline?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold block" style={{ color: "var(--text-secondary)" }}>
        {label}
      </label>
      {multiline ? (
        <textarea
          className="form-input resize-none"
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ lineHeight: 1.5 }}
        />
      ) : (
        <input type={type} className="form-input" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}
