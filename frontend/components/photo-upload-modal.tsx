"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { X, Upload, ImageIcon, Camera, MapPin, CheckCircle2, AlertCircle } from "lucide-react";

type Task = { id: string; title: string; status: string; end_date: string; progress_percent: number };

type PhotoUploadModalProps = {
  open: boolean;
  onClose: () => void;
  currentTask: Task | null;
  loading: boolean;
  onFileChange: (file: File | null) => void;
  onUpload: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  uploadMessage: string;
};

export function PhotoUploadModal({
  open,
  onClose,
  currentTask,
  loading,
  onFileChange,
  onUpload,
  uploadMessage,
}: PhotoUploadModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const handleFile = useCallback(
    (file: File | null) => {
      onFileChange(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (file) {
        setPreviewUrl(URL.createObjectURL(file));
        setFileName(file.name);
        setUploadProgress(0);
      } else {
        setPreviewUrl(null);
        setFileName(null);
        setUploadProgress(0);
      }
    },
    [onFileChange, previewUrl]
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) handleFile(file);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUploadProgress(0);
    const tick = setInterval(() => {
      if (!mountedRef.current) { clearInterval(tick); return; }
      setUploadProgress((p) => {
        if (p >= 90) { clearInterval(tick); return p; }
        return p + Math.random() * 15;
      });
    }, 200);
    try {
      await onUpload(e);
      if (mountedRef.current) setUploadProgress(100);
    } finally {
      clearInterval(tick);
    }
  };

  if (!open) return null;

  const done = uploadMessage.length > 0;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !loading && onClose()}>
      <div className="modal-sheet" style={{ maxWidth: 520 }}>
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}
            >
              <Camera size={18} className="text-white" />
            </div>
            <div>
              <div className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Upload Evidence</div>
              {currentTask && (
                <div className="text-xs truncate" style={{ color: "var(--text-tertiary)", maxWidth: 300 }}>
                  {currentTask.title}
                </div>
              )}
            </div>
          </div>
          <button
            className="modal-close-btn"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body space-y-4">
          {/* Task context chip */}
          {currentTask && (
            <div
              className="flex items-center gap-3 rounded-xl px-4 py-3"
              style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate" style={{ color: "#92400e" }}>
                  {currentTask.title}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "#b45309" }}>
                  Due: {currentTask.end_date} · {currentTask.progress_percent}% progress
                </div>
              </div>
              <div
                className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ background: "rgba(245,158,11,0.15)", color: "#d97706" }}
              >
                Active
              </div>
            </div>
          )}

          {!currentTask && (
            <div
              className="rounded-xl px-4 py-3 text-sm text-center"
              style={{ background: "var(--amber-light)", color: "var(--amber-strong)" }}
            >
              Select a task from the sidebar before uploading evidence.
            </div>
          )}

          {/* Success state */}
          {done ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full"
                style={{ background: "var(--green-light)" }}
              >
                <CheckCircle2 size={32} style={{ color: "var(--green-strong)" }} />
              </div>
              <div>
                <div className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                  Evidence sent!
                </div>
                <div className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                  Sent to the supervisor review queue.
                </div>
              </div>
              <div className="upload-progress-track w-full">
                <div className="upload-progress-fill" style={{ width: "100%" }} />
              </div>
              <button type="button" className="btn-primary" onClick={() => {
                handleFile(null);
                onClose();
              }}>
                Close
              </button>
            </div>
          ) : (
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
              {/* Preview or dropzone */}
              {previewUrl ? (
                <div className="relative">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="upload-preview"
                  />
                  <button
                    type="button"
                    className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-2xl bg-black/60 backdrop-blur-md border border-white/20 text-white hover:bg-red-500/80 transition-all transform hover:rotate-90 shadow-lg"
                    onClick={() => handleFile(null)}
                    title="Remove image"
                  >
                    <X size={18} />
                  </button>
                  {fileName && (
                    <div
                      className="mt-2 text-xs px-3 py-1.5 rounded-lg truncate"
                      style={{ background: "rgba(0,0,0,0.05)", color: "var(--text-secondary)" }}
                    >
                      📎 {fileName}
                    </div>
                  )}
                </div>
              ) : (
                <label
                  className={`upload-dropzone block ${dragOver ? "drag-over" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                >
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                  />
                  <div className="flex flex-col items-center gap-3">
                    <div
                      className="flex h-14 w-14 items-center justify-center rounded-2xl"
                      style={{ background: "rgba(59,130,246,0.12)" }}
                    >
                      <ImageIcon size={26} style={{ color: "#3b82f6" }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        Drag or choose an image
                      </p>
                      <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                        JPG, PNG, HEIC · Max 50MB
                      </p>
                    </div>
                    <div
                      className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full"
                      style={{ background: "rgba(59,130,246,0.08)", color: "#3b82f6" }}
                    >
                      <Camera size={12} />
                      You can also use the device camera
                    </div>
                  </div>
                </label>
              )}

              {/* GPS chip */}
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs"
                style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.15)" }}
              >
                <MapPin size={13} style={{ color: "#10b981" }} />
                <span style={{ color: "#065f46" }}>
                  Coordenadas demo (19.43°N, 99.13°W) · geofence activo
                </span>
              </div>

              {/* Progress bar (while uploading) */}
              {loading && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs" style={{ color: "var(--text-secondary)" }}>
                     <span>Uploading evidence…</span>
                    <span>{Math.round(uploadProgress)}%</span>
                  </div>
                  <div className="upload-progress-track">
                    <div
                      className="upload-progress-fill"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="btn-primary w-full py-3"
                disabled={loading || !previewUrl || !currentTask}
                style={{ fontSize: 15 }}
              >
                {loading ? (
                  <>
                    <span className="spinner" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    Send for review
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
