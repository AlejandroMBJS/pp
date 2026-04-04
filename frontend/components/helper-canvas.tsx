"use client";

import type { FormEvent } from "react";
import { useState, useCallback } from "react";
import { Upload, ImageIcon, X } from "lucide-react";
import { EmptyState } from "./ui/empty-state";
import { ListRow } from "./ui/list-row";

type Task = { id: string; title: string; status: string; end_date: string; progress_percent: number; description: string };
type Evidence = { id: string; file_name: string; status: string; quality_score: number };

type HelperCanvasProps = {
  activeView: string;
  currentTask: Task | null;
  evidences: Evidence[];
  uploadMessage: string;
  onFileChange: (file: File | null) => void;
  onUpload: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  loading: boolean;
  isMobile?: boolean;
};

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
  evidences,
  uploadMessage,
  onFileChange,
  onUpload,
  loading,
  isMobile = false,
}: HelperCanvasProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

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
            ) : (
              <div className="rounded-2xl bg-white/[0.02] border border-dashed border-white/10 p-8 text-center">
                <p className="text-white/30 text-sm font-medium italic">
                   Select a task in the <span className="text-blue-400 font-bold uppercase tracking-widest text-[10px]">Inspector</span> to capture evidence.
                </p>
              </div>
            )}


            <form onSubmit={onUpload} className="space-y-6">
              {/* Preview or dropzone */}
              {previewUrl ? (
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
                <label className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-white/10 bg-white/5 p-8 text-center transition-all hover:bg-white/10 hover:border-blue-500/50 group relative overflow-hidden">
                  <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                  />
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500">
                    <Upload size={32} />
                  </div>
                  <div>
                     <p className="text-lg font-bold text-white tracking-tight">Capture Evidence</p>
                     <p className="mt-1 text-sm text-white/40 font-medium">JPG, PNG, HEIC · Max 50MB</p>
                  </div>
                </label>
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
                    e.status === "approved" ? "bg-green-500/10 text-green-400 border-green-500/20" :
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
