"use client";

import { X, Calendar, User, DollarSign, Activity, AlertCircle, CheckCircle2, Trash2, Plus, ImageIcon, Upload } from "lucide-react";
import { useEffect, useState, useRef, useCallback } from "react";

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
  comparison_photo_url?: string;
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
  onSave: (taskId: string, data: Partial<Task>, comparisonFile?: File | null) => Promise<void>;
  onDelete?: (taskId: string) => Promise<void>;
  loading: boolean;
  token?: string;
};

export function TaskEditModal({
  isOpen,
  onClose,
  task,
  users,
  onSave,
  onDelete,
  loading,
  token,
}: TaskEditModalProps) {
  const [formData, setFormData] = useState<Partial<Task>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [comparisonEnabled, setComparisonEnabled] = useState(false);
  const [comparisonFile, setComparisonFile] = useState<File | null>(null);
  const [comparisonPreview, setComparisonPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const comparisonInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);

  const handleComparisonFile = useCallback((file: File | null) => {
    setComparisonFile(file);
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = file ? URL.createObjectURL(file) : null;
    previewRef.current = url;
    setComparisonPreview(url);
  }, []);

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

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
        comparison_photo_url: task.comparison_photo_url,
      });
      setComparisonEnabled(!!task.comparison_photo_url);
      setComparisonFile(null);
      setComparisonPreview(null);
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
        comparison_photo_url: "",
      });
      setComparisonEnabled(false);
      setComparisonFile(null);
      setComparisonPreview(null);
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
    onSave(isNew ? "" : (task as Task).id, formData, comparisonEnabled ? comparisonFile : null);
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
                  min="0" onChange={(e) => setFormData({ ...formData, budget_cents: Math.max(0, Number(e.target.value)) * 100 })}
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

          {/* Comparison Photo */}
          <div className="space-y-3 p-4 bg-white/5 rounded-2xl border border-white/5">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={comparisonEnabled}
                onChange={(e) => {
                  setComparisonEnabled(e.target.checked);
                  if (!e.target.checked) {
                    handleComparisonFile(null);
                  }
                }}
                className="w-4 h-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500/50 accent-blue-500"
              />
              <div className="flex items-center gap-2">
                <ImageIcon size={16} className="text-blue-400" />
                <span className="text-xs font-bold text-white/60 uppercase tracking-wider">Foto de comparaci&oacute;n (referencia/render)</span>
              </div>
            </label>

            {comparisonEnabled && (
              <div className="space-y-3 mt-2">
                <p className="text-[11px] text-white/40">
                  Sube una foto de referencia (render, dise&ntilde;o, modelo). La IA comparar&aacute; la evidencia del ayudante con esta imagen.
                </p>

                {/* Existing photo */}
                {formData.comparison_photo_url && !comparisonPreview && (
                  <div className="relative group">
                    <img
                      src={formData.comparison_photo_url}
                      alt="Foto de comparación"
                      className="w-full h-40 object-cover rounded-xl border border-white/10"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => comparisonInputRef.current?.click()}
                        className="px-4 py-2 bg-white/20 backdrop-blur-sm rounded-lg text-xs font-bold text-white"
                      >
                        Reemplazar imagen
                      </button>
                    </div>
                  </div>
                )}

                {/* Preview of new file */}
                {comparisonPreview && (
                  <div className="relative group">
                    <img
                      src={comparisonPreview}
                      alt="Preview"
                      className="w-full h-40 object-cover rounded-xl border border-blue-500/30"
                    />
                    <button
                      type="button"
                      onClick={() => handleComparisonFile(null)}
                      className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-lg text-white/80 hover:text-white"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* Drag-and-drop zone */}
                {!comparisonPreview && !formData.comparison_photo_url && (
                  <label
                    className={`block w-full cursor-pointer rounded-xl border-2 border-dashed transition-all py-6 ${
                      dragOver
                        ? "border-blue-500/60 bg-blue-500/10"
                        : "border-white/10 hover:border-blue-500/30 hover:bg-white/[0.02]"
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      const file = e.dataTransfer.files[0];
                      if (file && file.type.startsWith("image/")) handleComparisonFile(file);
                    }}
                  >
                    <input
                      ref={comparisonInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/tiff,image/avif,image/bmp,image/heic"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file && file.type.startsWith("image/")) handleComparisonFile(file);
                        e.target.value = "";
                      }}
                    />
                    <div className="flex flex-col items-center gap-2">
                      <div className={`p-2.5 rounded-xl transition-colors ${dragOver ? "bg-blue-500/20" : "bg-white/5"}`}>
                        <Upload size={20} className={dragOver ? "text-blue-400" : "text-white/30"} />
                      </div>
                      <div className="text-center">
                        <p className={`text-xs font-bold ${dragOver ? "text-blue-400" : "text-white/50"}`}>
                          Arrastra o selecciona la imagen de referencia
                        </p>
                        <p className="text-[10px] text-white/30 mt-1">PNG, JPG, WebP, GIF, TIFF, AVIF, BMP, HEIC</p>
                      </div>
                    </div>
                  </label>
                )}

                {/* Replace button when existing photo is shown */}
                {!comparisonPreview && formData.comparison_photo_url && (
                  <input
                    ref={comparisonInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/tiff,image/avif,image/bmp,image/heic"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && file.type.startsWith("image/")) handleComparisonFile(file);
                      e.target.value = "";
                    }}
                  />
                )}
              </div>
            )}
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
