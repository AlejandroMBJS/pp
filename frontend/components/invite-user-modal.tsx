"use client";

import { X, UserPlus, Mail, User, Shield, Copy, CheckCircle2, Loader2, ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type UserInviteResponse = {
  user: { id: string; email: string; full_name: string; role: string };
  invite_url: string;
  invite_expires_at: string;
};

type InviteUserModalProps = {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  onInvited?: () => void | Promise<void>;
};

const roleOptions = [
  { value: "supervisor", label: "Supervisor", desc: "Can manage tasks, review evidence, track timeline", color: "#0ea5e9" },
  { value: "helper",     label: "Operator",   desc: "Field worker who captures progress and evidence", color: "#f59e0b" },
  { value: "client",     label: "Client",     desc: "View-only access to project summaries and gallery", color: "#10b981" },
];

export function InviteUserModal({ isOpen, onClose, token, onInvited }: InviteUserModalProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("supervisor");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UserInviteResponse | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      toast.error("Name and email are required.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/v1/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ full_name: fullName.trim(), email: email.trim(), role }),
      });
      const data = await res.json();
      if (!res.ok) {
        // F17: surface 409 (email already invited / already exists) as a
        // specific message instead of the raw backend string.
        if (res.status === 409) {
          throw new Error("That email already has an invite or account.");
        }
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setResult(data);
      toast.success("Invitation created successfully.");
      await onInvited?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create invite");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result?.invite_url) return;
    try {
      await navigator.clipboard.writeText(result.invite_url);
      setCopied(true);
      toast.success("Invite link copied to clipboard.");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  const handleClose = () => {
    setFullName("");
    setEmail("");
    setRole("supervisor");
    setResult(null);
    setCopied(false);
    onClose();
  };

  const selectedRole = roleOptions.find((r) => r.value === role);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="modal-sheet max-w-lg w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
              <UserPlus size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Invite Team Member</h2>
              <p className="text-xs text-white/50 uppercase tracking-widest font-bold">
                Send an invitation link
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 rounded-xl hover:bg-white/5 text-white/50 transition-colors">
            <X size={20} />
          </button>
        </div>

        {!result ? (
          /* ── Invite Form ── */
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white/40 uppercase ml-1">Full name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-semibold"
                  placeholder="John Doe"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white/40 uppercase ml-1">Email address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                  placeholder="john@company.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-white/40 uppercase ml-1 flex items-center gap-1.5">
                <Shield size={12} /> Role
              </label>
              <div className="space-y-2">
                {roleOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRole(opt.value)}
                    className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all"
                    style={{
                      background: role === opt.value ? `${opt.color}15` : "rgba(255,255,255,0.03)",
                      border: `1px solid ${role === opt.value ? `${opt.color}40` : "rgba(255,255,255,0.08)"}`,
                    }}
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0 transition-all"
                      style={{
                        background: role === opt.value ? opt.color : "transparent",
                        border: `2px solid ${role === opt.value ? opt.color : "rgba(255,255,255,0.2)"}`,
                      }}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-semibold" style={{ color: role === opt.value ? opt.color : "rgba(255,255,255,0.7)" }}>
                        {opt.label}
                      </div>
                      <div className="text-[11px] text-white/40">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-6 py-3 text-sm font-bold text-white/60 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !fullName.trim() || !email.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-white shadow-lg disabled:opacity-50 transition-all"
                style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", boxShadow: "0 4px 20px rgba(139,92,246,0.3)" }}
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
                {loading ? "Creating..." : "Send Invitation"}
              </button>
            </div>
          </form>
        ) : (
          /* ── Success State ── */
          <div className="p-6 space-y-5">
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-4">
                <CheckCircle2 size={32} className="text-green-400" />
              </div>
              <h3 className="text-lg font-bold text-white">Invitation Created</h3>
              <p className="text-sm text-white/50 mt-1">
                <span className="font-semibold text-white/80">{result.user.full_name}</span> has been invited as{" "}
                <span className="font-semibold" style={{ color: selectedRole?.color }}>{selectedRole?.label}</span>
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-white/40 uppercase ml-1">Invite link</label>
              <div className="flex gap-2">
                <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white/60 font-mono truncate">
                  {result.invite_url}
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-sm transition-all flex-shrink-0"
                  style={{
                    background: copied ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.08)",
                    color: copied ? "#10b981" : "white",
                    border: `1px solid ${copied ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.1)"}`,
                  }}
                >
                  {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-[11px] text-white/30 ml-1">
                Share this link with the user. They will set their password on first visit.
              </p>
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={() => { setResult(null); setFullName(""); setEmail(""); }}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-white/70 transition-all"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <UserPlus size={16} />
                Invite Another
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-white shadow-lg transition-all"
                style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", boxShadow: "0 4px 20px rgba(139,92,246,0.3)" }}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
