"use client";

import { FormEvent, useState } from "react";
import { X, Loader2 } from "lucide-react";

type User = { id: string; full_name: string; email: string; role: string };

type Props = {
  open: boolean;
  onClose: () => void;
  supervisors: User[];
  clients: User[];
  loading: boolean;
  onSubmit: (project: {
    name: string;
    description: string;
    supervisor_user_id: string;
    client_user_id: string;
    budget_total_cents: number;
    spent_total_cents: number;
    start_date: string;
    planned_end_date: string;
    latitude_center: number;
    longitude_center: number;
    geofence_radius_m: number;
  }) => Promise<void>;
};

const today = new Date().toISOString().slice(0, 10);
const plus90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

export function NewProjectModal({ open, onClose, supervisors, clients, loading, onSubmit }: Props) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    supervisor_user_id: "",
    client_user_id: "",
    budget: "",
    start_date: today,
    planned_end_date: plus90,
  });

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const budgetNum = parseFloat(form.budget || "0");
    await onSubmit({
      name: form.name,
      description: form.description,
      supervisor_user_id: form.supervisor_user_id,
      client_user_id: form.client_user_id,
      budget_total_cents: Math.max(0, Math.round(budgetNum * 100)),
      spent_total_cents: 0,
      start_date: form.start_date,
      planned_end_date: form.planned_end_date,
      latitude_center: 19.4326,
      longitude_center: -99.1332,
      geofence_radius_m: 120,
    });
    setForm({ name: "", description: "", supervisor_user_id: "", client_user_id: "", budget: "", start_date: today, planned_end_date: plus90 });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="text-lg font-black text-white">New Project</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 text-white/50"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-bold text-white/50 mb-1.5">Project name *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
              placeholder="e.g. Tower 3 Foundation"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-bold text-white/50 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 resize-none"
              placeholder="Brief description of the project scope"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-bold text-white/50 mb-1.5">Supervisor</label>
              <select
                value={form.supervisor_user_id}
                onChange={(e) => setForm({ ...form, supervisor_user_id: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500/50"
              >
                <option value="">None</option>
                {supervisors.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-bold text-white/50 mb-1.5">Client</label>
              <select
                value={form.client_user_id}
                onChange={(e) => setForm({ ...form, client_user_id: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500/50"
              >
                <option value="">None</option>
                {clients.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-bold text-white/50 mb-1.5">Budget (USD)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.budget}
              onChange={(e) => setForm({ ...form, budget: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
              placeholder="0.00"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-bold text-white/50 mb-1.5">Start date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-bold text-white/50 mb-1.5">End date</label>
              <input
                type="date"
                value={form.planned_end_date}
                onChange={(e) => setForm({ ...form, planned_end_date: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500/50"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading || !form.name.trim()}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
          >
            {loading ? <><Loader2 size={14} className="animate-spin" /> Creating...</> : "Create project"}
          </button>
        </form>
      </div>
    </div>
  );
}
