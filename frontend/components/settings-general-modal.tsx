"use client";

import { X, Building2, Bell, Shield, Globe, ChevronRight, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type User = { id: string; email: string; full_name: string; role: string };

type SettingsGeneralModalProps = {
  open: boolean;
  onClose: () => void;
  companyName?: string;
  userCount?: number;
  users?: User[];
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
}: SettingsGeneralModalProps) {
  const [activeTab, setActiveTab] = useState("company");

  if (!open) return null;

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

          {activeTab === "team" && (
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
              {users.length === 0 ? (
                <div
                  className="rounded-xl px-4 py-8 text-center text-sm"
                  style={{ background: "rgba(0,0,0,0.03)", color: "var(--text-tertiary)" }}
                >
                  No users registered yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {users.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-gray-50"
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "notifs" && (
            <div className="space-y-4">
              <SectionLabel>Platform alerts</SectionLabel>
              <SettingToggle label="Evidence pending approval" description="Notify when an operator uploads evidence." defaultOn />
              <SettingToggle label="Task nearing due date" description="Alert 2 days before deadline." defaultOn />
              <SettingToggle label="Deliverable approved" description="Notify when a client opens an approved deliverable." />
              <SettingToggle label="Budget at 80%" description="Alert when the project reaches 80% of budget consumption." defaultOn />

              <SectionLabel>Email</SectionLabel>
              <SettingToggle label="Weekly executive summary" description="Metrics digest every Monday." defaultOn />
              <SettingToggle label="Critical email alerts" description="Only high-priority events." defaultOn />
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-4">
              <SectionLabel>Authentication</SectionLabel>
              <SettingToggle label="Two-factor authentication" description="Require 2FA for all users." />
              <SettingToggle label="Enterprise SSO" description="Google Workspace / Okta." />

              <SectionLabel>Sessions</SectionLabel>
              <SettingFieldSelect label="Session duration" options={["8 hours", "24 hours", "7 days", "30 days"]} />
              <SettingToggle label="Detect suspicious IPs" description="Block sign-ins from unusual locations." defaultOn />

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
}: {
  label: string;
  description?: string;
  defaultOn?: boolean;
}) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div
      className="flex items-center justify-between gap-4 rounded-xl px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50"
      style={{ border: "1px solid rgba(0,0,0,0.06)" }}
      onClick={() => setOn((v) => !v)}
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
