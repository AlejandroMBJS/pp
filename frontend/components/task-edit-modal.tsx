"use client";

import { X, Calendar, User, DollarSign, Activity, AlertCircle, CheckCircle2, Trash2, Plus } from "lucide-react";
import { useEffect, useState } from "react";

type Task = {
  id: string;
  title: string;
  description: string;
  status: string;
  start_date: string;
  end_date: string;
  progress_percent: number;
  budget_cents: number;
  spent_cents: number;
  assigned_to_user_id: string;
};

type UserType = {
  id: string;
  full_name: string;
  email: string;
};

type TaskEditModalProps = {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  users: UserType[];
  onSave: (taskId: string, data: Partial<Task>) => Promise<void>;
  onDelete?: (taskId: string) => Promise<void>;
  loading: boolean;
};

export function TaskEditModal({
  isOpen,
  onClose,
  task,
  users,
  onSave,
  onDelete,
  loading,
}: TaskEditModalProps) {
  const [formData, setFormData] = useState<Partial<Task>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title,
        description: task.description,
        status: task.status,
        start_date: task.start_date,
        end_date: task.end_date,
        progress_percent: task.progress_percent,
        budget_cents: task.budget_cents,
        spent_cents: task.spent_cents,
        assigned_to_user_id: task.assigned_to_user_id,
      });
    } else {
      setFormData({
        title: "",
        description: "",
        status: "pending",
        start_date: "",
        end_date: "",
        progress_percent: 0,
        budget_cents: 0,
        spent_cents: 0,
        assigned_to_user_id: "",
      });
    }
  }, [task]);

  if (!isOpen) return null;
  const isNew = !task || !task.id;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title?.trim()) {
      setFormError("Task title is required.");
      return;
    }
    if (formData.start_date && formData.end_date && formData.start_date > formData.end_date) {
      setFormError("Start date must be before due date.");
      return;
    }
    setFormError(null);
    onSave(isNew ? "" : (task as Task).id, formData);
  };

  const money = (cents: number) => (cents / 100).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

  return (
    <div className="modal-overlay">
      <div className="modal-sheet max-w-2xl w-full animate-slide-up">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
              <Activity size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{(task && task.id) ? "Edit Task" : "New Task"}</h2>
              <p className="text-xs text-white/50 uppercase tracking-widest font-bold">
                {(task && task.id) ? `Ref: ${task.id.slice(0, 8)}` : "New Technical Record"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/5 text-white/50 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
          {/* Main Info */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white/40 uppercase ml-1">Task title</label>
              <input
                type="text"
                value={formData.title || ""}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-semibold"
                placeholder="e.g. Assembly of module A"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white/40 uppercase ml-1">Description</label>
              <textarea
                value={formData.description || ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm"
                placeholder="Technical details or instructions..."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Dates */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white/40 uppercase ml-1">Start date</label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                <input
                  type="date"
                  value={formData.start_date || ""}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white/40 uppercase ml-1">Due date</label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                <input
                  type="date"
                  value={formData.end_date || ""}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Status & Assignee */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white/40 uppercase ml-1">Status</label>
              <select
                value={formData.status || ""}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm appearance-none"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On hold</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white/40 uppercase ml-1">Assignee</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                <select
                  value={formData.assigned_to_user_id || ""}
                  onChange={(e) => setFormData({ ...formData, assigned_to_user_id: e.target.value })}
                  className="w-full bg-[#0f172a] border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm appearance-none"
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Progress */}
          <div className="space-y-3 p-4 bg-white/5 rounded-2xl border border-white/5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-white/40 uppercase">Actual Progress</label>
              <span className="text-lg font-black text-blue-400">{formData.progress_percent}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={formData.progress_percent || 0}
              onChange={(e) => setFormData({ ...formData, progress_percent: Number(e.target.value) })}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Budget */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white/40 uppercase ml-1">Budget (MXN)</label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                <input
                  type="number"
                  value={(formData.budget_cents || 0) / 100}
                  onChange={(e) => setFormData({ ...formData, budget_cents: Number(e.target.value) * 100 })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm font-mono"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white/40 uppercase ml-1">Actual spend (MXN)</label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                <input
                  type="number"
                  value={(formData.spent_cents || 0) / 100}
                  onChange={(e) => setFormData({ ...formData, spent_cents: Number(e.target.value) * 100 })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm font-mono"
                />
              </div>
            </div>
          </div>
        </form>

        {formError && (
          <div className="mx-6 mb-0 -mt-2 flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
            <AlertCircle size={14} className="shrink-0" />
            {formError}
          </div>
        )}

        <div className="p-6 bg-white/5 border-t border-white/10 flex items-center justify-between">
          {onDelete ? (
            <button
              type="button"
              onClick={() => onDelete?.(task?.id || "")}
              className="p-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
              title="Delete task"
            >
              <Trash2 size={20} />
            </button>
          ) : <div />}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 text-sm font-bold text-white/60 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="btn-glass px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-500/20 disabled:opacity-50"
            >
              {loading ? <Activity size={18} className="animate-spin" /> : (!isNew ? <CheckCircle2 size={18} /> : <Plus size={18} />)}
              {!isNew ? "Save Changes" : "Create Task"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
