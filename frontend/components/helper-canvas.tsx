"use client";

import type { FormEvent } from "react";
import { useState, useCallback, useEffect } from "react";
import { Upload, ImageIcon, X, ListChecks, ArrowRight, CheckCircle2, Clock3, AlertCircle } from "lucide-react";
import { EmptyState } from "./ui/empty-state";
import { ListRow } from "./ui/list-row";
import { ResubmitDeliverableModal } from "./ui/resubmit-deliverable-modal";

type Task = {
  id: string;
  title: string;
  status: string;
  end_date: string;
  progress_percent: number;
  description: string;
  comparison_photo_url?: string;
  client_decision_status?: string;
  client_decision_reason?: string;
  client_decision_category?: string;
  client_decision_at?: string;
  client_decision_by_name?: string;
  client_decision_deliverable_id?: string;
  client_decision_title?: string;
};
type Evidence = { id: string; file_name: string; status: string; quality_score: number };

type HelperCanvasProps = {
  activeView: string;
  currentTask: Task | null;
  tasks: Task[];
  evidences: Evidence[];
  uploadMessage: string;
  onFileChange: (file: File | null) => void;
  onUpload: (e: FormEvent<HTMLFormElement>, progressPercent: number) => Promise<void>;
  onSelectTask: (taskId: string) => void;
  onViewChange?: (view: string) => void;
  onResubmitDeliverable?: (deliverableId: string, note: string) => Promise<void>;
  loading: boolean;
  isMobile?: boolean;
  token: string;
};

function withAccessToken(url: string | undefined, token: string): string {
  if (!url) return "";
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}access_token=${encodeURIComponent(token)}`;
}

function statusBadgeColor(status: string): "green" | "amber" | "red" | "gray" {
  switch (status) {
    case "approved": case "committed": return "green";
    case "rejected": return "red";
    case "pending_approval": return "amber";
    default: return "gray";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "approved": return "Approved";
    case "committed": return "Committed";
    case "rejected": return "Rejected";
    case "pending_approval": return "Pending";
    default: return status;
  }
}

export function HelperCanvas({
  activeView,
  currentTask,
  tasks,
  evidences,
  uploadMessage,
  onFileChange,
  onUpload,
  onSelectTask,
  onViewChange,
  onResubmitDeliverable,
  loading,
  isMobile = false,
  token,
}: HelperCanvasProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progressDraft, setProgressDraft] = useState<number>(currentTask?.progress_percent ?? 0);
  const [resubmitTask, setResubmitTask] = useState<Task | null>(null);

  useEffect(() => {
    setProgressDraft(currentTask?.progress_percent ?? 0);
  }, [currentTask?.id, currentTask?.progress_percent]);

  const handleFileChange = useCallback(
    (file: File | null) => {
      onFileChange(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (file) {
        setPreviewUrl(URL.createObjectURL(file));
        setFileName(file.name);
      } else {
        setPreviewUrl(null);
        setFileName(null);
      }
    },
    [onFileChange, previewUrl]
  );

  const clearFile = useCallback(() => {
    handleFileChange(null);
  }, [handleFileChange]);

  // ── Helper landing view: My tasks ──
  if (activeView === "tasks") {
    const sorted = [...tasks].sort((a, b) => {
      // Tasks with rejected client decisions first (action needed),
      // then in_progress, then pending, then completed.
      const rank = (t: Task) => {
        if (t.client_decision_status === "rejected") return 0;
        if (t.status === "in_progress") return 1;
        if (t.status === "pending") return 2;
        return 3;
      };
      const ra = rank(a); const rb = rank(b);
      if (ra !== rb) return ra - rb;
      return (a.end_date || "").localeCompare(b.end_date || "");
    });

    return (
      <div className={`space-y-6 animate-fade-in ${isMobile ? "pb-20" : ""}`}>
        <div className="executive-header">
          <h1 className={`${isMobile ? "text-2xl" : "text-4xl"} font-black text-white tracking-tight leading-none`}>
            My tasks
          </h1>
          <p className="mt-2 text-sm text-white/50 font-medium">
            {tasks.length === 0
              ? "You don't have any tasks assigned yet."
              : `${tasks.length} task${tasks.length === 1 ? "" : "s"} assigned to you.`}
          </p>
        </div>

        {tasks.length === 0 ? (
          <div className="glass-card p-12 text-center border-dashed border-white/10">
            <ListChecks size={28} className="mx-auto mb-3 text-white/25" />
            <p className="text-white/40 text-sm">When a supervisor assigns you a task, it will show up here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sorted.map((t) => {
              const overdue = t.status !== "completed" && t.end_date && new Date(t.end_date).getTime() < Date.now();
              const statusColor =
                t.status === "completed" ? "#10b981" :
                t.status === "in_progress" ? "var(--accent-blue)" :
                "#9ca3af";
              const Icon =
                t.status === "completed" ? CheckCircle2 :
                overdue ? AlertCircle :
                Clock3;
              return (
                <button
                  key={t.id}
                  type="button"
                  className="text-left rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 p-4 transition group"
                  onClick={() => { onSelectTask(t.id); onViewChange?.("capture"); }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `color-mix(in srgb, ${statusColor} 12%, transparent)`, color: statusColor }}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-white truncate group-hover:text-blue-400 transition-colors">
                        {t.title}
                      </div>
                      <div className="text-xs text-white/45 mt-0.5 flex items-center gap-2">
                        {t.end_date && <span>Due {new Date(t.end_date).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}</span>}
                        {overdue && <span className="text-red-400 font-bold">· OVERDUE</span>}
                      </div>
                    </div>
                    <ArrowRight size={16} className="text-white/20 group-hover:text-white/60 transition flex-shrink-0 mt-1" />
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all duration-500"
                      style={{ width: `${t.progress_percent}%`, background: statusColor }}
                    />
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/35 mt-1">
                    {t.progress_percent}% complete
                  </div>

                  {/* Client decision banner */}
                  {t.client_decision_status === "rejected" && (
                    <div className="mt-3 rounded-lg border px-3 py-2 text-xs" style={{ background: "rgba(245,158,11,0.10)", borderColor: "rgba(245,158,11,0.3)", color: "#f59e0b" }}>
                      <div className="font-bold inline-flex items-center gap-1">↺ Cliente pidió cambios</div>
                      {t.client_decision_reason && (
                        <div className="text-white/75 mt-1 line-clamp-2">{t.client_decision_reason}</div>
                      )}
                      {onResubmitDeliverable && t.client_decision_deliverable_id && (
                        <div
                          role="button"
                          tabIndex={0}
                          className="mt-2 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest cursor-pointer transition"
                          style={{ background: "color-mix(in srgb, #10b981 22%, transparent)", color: "#10b981", border: "1px solid color-mix(in srgb, #10b981 40%, transparent)" }}
                          onClick={(ev) => { ev.stopPropagation(); setResubmitTask(t); }}
                          onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.stopPropagation(); setResubmitTask(t); } }}
                        >
                          ↻ Resolved · re-submit
                        </div>
                      )}
                    </div>
                  )}
                  {t.client_decision_status === "approved" && (
                    <div className="mt-3 rounded-lg border px-3 py-2 text-xs" style={{ background: "rgba(16,185,129,0.10)", borderColor: "rgba(16,185,129,0.3)", color: "#10b981" }}>
                      <span className="font-bold">✓ Cliente aprobó</span>
                      {t.client_decision_by_name && <span className="text-white/55"> · {t.client_decision_by_name}</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <ResubmitDeliverableModal
          deliverable={resubmitTask && resubmitTask.client_decision_deliverable_id
            ? {
                id: resubmitTask.client_decision_deliverable_id,
                title: resubmitTask.client_decision_title || resubmitTask.title,
                task_title: resubmitTask.title,
                rejection_reason: resubmitTask.client_decision_reason,
                rejection_category: resubmitTask.client_decision_category,
              }
            : null}
          onClose={() => setResubmitTask(null)}
          onSubmit={async (id, note) => {
            if (onResubmitDeliverable) await onResubmitDeliverable(id, note);
          }}
        />
      </div>
    );
  }

  if (activeView === "capture") {
    return (
      <div className="max-w-xl mx-auto space-y-10 animate-slideInUp">
        <div className="executive-header">
          <h1 className="text-4xl font-black text-white tracking-tighter leading-none">
            {currentTask?.title ?? "Capture Progress"}
          </h1>
          <p className="mt-3 text-sm text-white/50 font-medium">
            Track physical project progress with high-quality evidence.
          </p>
        </div>

        <div className="glass-card p-0 overflow-hidden border-white/5 shadow-2xl">
          <div className="p-6 border-b border-white/5 bg-white/[0.03] flex items-center justify-between">
            <h2 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Capture panel</h2>
            {currentTask && (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 text-blue-400 rounded-lg text-[10px] font-black uppercase tracking-wider border border-blue-500/20">
                <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                Active Task
              </span>
            )}
          </div>

          <div className="p-8 space-y-8">
            {currentTask ? (
              <div className="space-y-3">
                <div className="rounded-2xl bg-gradient-to-br from-blue-600/10 to-cyan-600/10 border border-white/10 p-6 shadow-inner">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xl font-bold text-white tracking-tight leading-tight">{currentTask.title}</div>
                      <div className="mt-1.5 text-[10px] text-blue-400/80 font-bold uppercase tracking-widest">
                        Due: {currentTask.end_date}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-blue-400 leading-none">{currentTask.progress_percent}%</div>
                      <div className="text-[10px] text-white/30 font-bold uppercase tracking-widest mt-1">Progress</div>
                    </div>
                  </div>
                </div>
                {currentTask.client_decision_status === "approved" && (
                  <div className="rounded-xl border px-4 py-3 flex items-start gap-2 text-sm" style={{ background: "rgba(16,185,129,0.10)", borderColor: "rgba(16,185,129,0.3)", color: "#10b981" }}>
                    <span className="text-base leading-none">✓</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold">Cliente aprobó la entrega</div>
                      <div className="text-xs opacity-80 mt-0.5">
                        {currentTask.client_decision_by_name ? `por ${currentTask.client_decision_by_name}` : ""}
                        {currentTask.client_decision_at ? ` · ${new Date(currentTask.client_decision_at).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                      </div>
                    </div>
                  </div>
                )}
                {currentTask.client_decision_status === "rejected" && (
                  <div className="rounded-xl border px-4 py-3 text-sm" style={{ background: "rgba(245,158,11,0.10)", borderColor: "rgba(245,158,11,0.3)", color: "#f59e0b" }}>
                    <div className="flex items-start gap-2">
                      <span className="text-base leading-none">↺</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold">Cliente pidió cambios</div>
                        {currentTask.client_decision_reason && (
                          <div className="text-xs text-white/85 mt-1 whitespace-pre-wrap">{currentTask.client_decision_reason}</div>
                        )}
                        <div className="text-[10px] opacity-70 mt-1.5 uppercase tracking-widest font-bold">
                          {currentTask.client_decision_category ? currentTask.client_decision_category.replace(/_/g, " ") : ""}
                          {currentTask.client_decision_at ? ` · ${new Date(currentTask.client_decision_at).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl bg-white/[0.02] border border-dashed border-white/10 p-8 text-center space-y-3">
                <p className="text-white/40 text-sm font-medium italic">
                  No task selected. Pick one from <span className="text-blue-400 font-bold">My tasks</span> or the topbar pill.
                </p>
                <button
                  type="button"
                  onClick={() => onViewChange?.("tasks")}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 px-4 py-2 text-xs font-bold uppercase tracking-widest transition"
                >
                  <ListChecks size={14} /> Open my tasks
                </button>
              </div>
            )}


            <form onSubmit={(e) => onUpload(e, progressDraft)} className="space-y-6">
              {(() => {
                const hasReference = !!currentTask?.comparison_photo_url;
                const captureBlock = previewUrl ? (
                  <div className="relative group animate-scale-in">
                    <div className="aspect-video rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl">
                      <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                    <button
                      type="button"
                      className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-black/60 backdrop-blur-md border border-white/20 text-white hover:bg-red-500/80 transition-all transform hover:rotate-90 active:scale-90"
                      onClick={clearFile}
                      aria-label="Remove image"
                    >
                      <X size={20} />
                    </button>
                    <div className="absolute bottom-4 left-4 right-4 bg-black/40 backdrop-blur-lg border border-white/10 rounded-xl px-4 py-2 flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-xs text-white/80 font-mono truncate">{fileName}</span>
                    </div>
                  </div>
                ) : (
                  <label className="flex aspect-video cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-white/10 bg-white/5 p-6 text-center transition-all hover:bg-white/10 hover:border-blue-500/50 group relative overflow-hidden">
                    <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                    />
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500">
                      <Upload size={28} />
                    </div>
                    <div>
                      <p className="text-base font-bold text-white tracking-tight">Capture Evidence</p>
                      <p className="mt-1 text-xs text-white/40 font-medium">JPG, PNG, HEIC · Max 50MB</p>
                    </div>
                  </label>
                );
                if (!hasReference) return captureBlock;
                return (
                  <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
                    <div className="space-y-2">
                      <div className="text-[10px] text-blue-400/80 font-black uppercase tracking-widest">Reference</div>
                      <div className="aspect-video rounded-2xl overflow-hidden border-2 border-white/10 bg-white/5">
                        <img
                          src={withAccessToken(currentTask!.comparison_photo_url, token)}
                          alt="Reference render"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <p className="text-[11px] text-white/40 leading-snug">
                        Match this reference: framing, angle and lighting should resemble it.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="text-[10px] text-green-400/80 font-black uppercase tracking-widest">Your capture</div>
                      {captureBlock}
                    </div>
                  </div>
                );
              })()}

              {currentTask && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-white/50 uppercase tracking-widest">
                      Update progress
                    </label>
                    <span className="text-2xl font-black text-blue-400 leading-none tabular-nums">
                      {progressDraft}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={progressDraft}
                    onChange={(e) => setProgressDraft(Number(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                  <p className="text-[11px] text-white/40 leading-snug">
                    Drag to reflect the completion after this capture. Current value on record: {currentTask.progress_percent}%.
                  </p>
                </div>
              )}

              <button
                className="btn-glass w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-lg shadow-xl shadow-blue-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                disabled={loading || !previewUrl || !currentTask}
              >
                {loading ? (
                  <>
                    <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Uploading to cloud...
                  </>
                ) : (
                  <>
                    <Upload size={20} />
                    Submit Evidence
                  </>
                )}
              </button>

              {uploadMessage && (
                <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-400 font-bold text-center animate-bounce-subtle">
                  {uploadMessage}
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (activeView === "history") {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="executive-header">
          <h1 className="text-3xl font-black text-white tracking-tight">Evidence History</h1>
          <p className="mt-2 text-sm text-white/50 font-medium">
            Approval status and AI quality score for your uploads.
          </p>
        </div>

        {evidences.length === 0 ? (
          <div className="glass-card p-12 text-center border-dashed border-white/10">
            <div className="mx-auto w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-4">
              <ImageIcon size={32} className="text-white/20" />
            </div>
            <h3 className="text-lg font-bold text-white/80">No records</h3>
            <p className="text-sm text-white/40 mt-1">You have not uploaded evidence for this task yet.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {evidences.map((e) => (
              <div
                key={e.id}
                className="glass-card p-4 flex items-center justify-between group hover:bg-white/10 transition-all cursor-default border-white/5"
              >
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/20 group-hover:text-blue-400 group-hover:bg-blue-500/10 transition-colors">
                    <ImageIcon size={20} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">{e.file_name}</div>
                    <div className="text-[10px] text-white/40 font-black uppercase tracking-widest mt-0.5">
                      {e.quality_score > 0 ? `AI SCORE: ${e.quality_score}/100` : "AI SCORE PENDING"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${
                    (e.status === "approved" || e.status === "committed") ? "bg-green-500/10 text-green-400 border-green-500/20" :
                    e.status === "rejected" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                    "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  }`}>
                    {statusLabel(e.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}
