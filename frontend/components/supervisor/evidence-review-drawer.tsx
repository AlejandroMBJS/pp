"use client";

import { useRef, useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Sparkles,
  ChevronDown,
  Star,
  User,
  Calendar,
  MapPin,
  Upload,
  Send,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { withAccessToken } from "../../lib/files";
import { BeforeAfterSlider } from "../client/before-after-slider";
import { toast } from "sonner";
import type { AIFeedback } from "../evidence-gallery";

type Evidence = {
  id: string;
  task_id: string;
  file_name: string;
  url_archivo: string;
  reference_photo_url?: string;
  status: string;
  ai_processing_status?: string;
  quality_score: number;
  ai_feedback?: AIFeedback;
  uploader_name?: string;
  task_title?: string;
  created_at?: string;
  latitude?: number;
  longitude?: number;
};

type RejectedDeliverable = {
  id: string;
  title: string;
  rejection_reason?: string;
  rejection_category?: string;
};

type Props = {
  evidence: Evidence | null;
  /** Rejected deliverable for this evidence's task (if any). When present,
   *  surfaces the "Resolve client request" action panel. */
  rejectedDeliverable?: RejectedDeliverable | null;
  accessToken?: string;
  onApprove?: (id: string) => void | Promise<void>;
  onReject?: (id: string, reason: string) => void | Promise<void>;
  onReAudit?: (id: string) => void | Promise<void>;
  /** Upload a new evidence file for this task (separate from the resubmit
   *  step). Returns once the upload + confirm round-trip completed. */
  onUploadEvidence?: (taskId: string, file: File) => Promise<void>;
  /** Open the resubmit-deliverable modal (with its "what changed" textarea). */
  onResubmitOpen?: () => void;
  /** Open the basic task edit modal (title/dates/assignee/etc). Always shown
   *  as a quiet secondary action, separated from the resolve flow. */
  onEditTask?: () => void;
};

function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusBadge(status: string) {
  if (status === "approved" || status === "committed") return { label: "Approved", color: "#10b981", bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.3)" };
  if (status === "rejected") return { label: "Rejected", color: "#ef4444", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)" };
  if (status === "pending_approval") return { label: "Pending review", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)" };
  return { label: status, color: "#9ca3af", bg: "rgba(156,163,175,0.12)", border: "rgba(156,163,175,0.3)" };
}

export function EvidenceReviewDrawerContent({
  evidence,
  rejectedDeliverable,
  accessToken,
  onApprove,
  onReject,
  onReAudit,
  onUploadEvidence,
  onResubmitOpen,
  onEditTask,
}: Props) {
  const [pending, setPending] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [aiOpen, setAiOpen] = useState(true);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!evidence) return null;
  const badge = statusBadge(evidence.status);
  const hasReference = !!evidence.reference_photo_url;
  const afterUrl = withAccessToken(evidence.url_archivo, accessToken);
  const beforeUrl = hasReference ? withAccessToken(evidence.reference_photo_url!, accessToken) : "";
  const ai = evidence.ai_feedback;
  const isPending = evidence.status === "pending_approval";
  const aiProcessing = evidence.ai_processing_status === "processing" || evidence.ai_processing_status === "queued";

  async function doApprove() {
    if (!onApprove || !evidence) return;
    setPending(true);
    try {
      await onApprove(evidence.id);
      toast.success("Evidence approved");
    } catch (e) {
      toast.error((e as Error).message || "Could not approve");
    } finally {
      setPending(false);
    }
  }

  async function doReject() {
    if (!onReject || !evidence) return;
    setPending(true);
    try {
      await onReject(evidence.id, reason.trim());
      toast.success("Evidence rejected");
    } catch (e) {
      toast.error((e as Error).message || "Could not reject");
    } finally {
      setPending(false);
      setRejectOpen(false);
      setReason("");
    }
  }

  async function doReAudit() {
    if (!onReAudit || !evidence) return;
    setPending(true);
    try {
      await onReAudit(evidence.id);
      toast.success("Re-audit queued");
    } catch (e) {
      toast.error((e as Error).message || "Could not re-audit");
    } finally {
      setPending(false);
    }
  }

  async function doUpload() {
    if (!onUploadEvidence || !uploadFile || !evidence) return;
    setUploading(true);
    const toastId = toast.loading("Uploading new evidence…");
    try {
      await onUploadEvidence(evidence.task_id, uploadFile);
      toast.dismiss(toastId);
      toast.success("Evidence uploaded. Now re-submit when you're ready.");
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      toast.dismiss(toastId);
      toast.error((e as Error).message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const hasGPS = typeof evidence.latitude === "number" && typeof evidence.longitude === "number" && (evidence.latitude !== 0 || evidence.longitude !== 0);

  return (
    <div className="space-y-5">
      {/* Status banner */}
      <div className="drawer-status-banner" style={{ background: badge.bg, borderColor: badge.border, color: badge.color }}>
        {evidence.status === "approved" || evidence.status === "committed" ? <CheckCircle2 size={16} /> : evidence.status === "rejected" ? <AlertCircle size={16} /> : <ThumbsUp size={16} />}
        <span className="font-bold">{badge.label}</span>
        <span className="opacity-60">·</span>
        <span>{fmtDateTime(evidence.created_at)}</span>
        {evidence.quality_score > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold">
            <Star size={11} /> {evidence.quality_score}
          </span>
        )}
      </div>

      {/* Image / before-after */}
      <div className="rounded-xl overflow-hidden">
        {hasReference ? (
          <BeforeAfterSlider beforeUrl={beforeUrl} afterUrl={afterUrl} beforeAlt="Reference" afterAlt={evidence.file_name} />
        ) : (
          <img src={afterUrl} alt={evidence.file_name} className="w-full h-auto block" style={{ background: "#0a0a12", aspectRatio: "16/10", objectFit: "cover" }} />
        )}
      </div>

      {/* Meta row */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        {evidence.uploader_name && (
          <Meta icon={<User size={12} />} label="Uploaded by" value={evidence.uploader_name} />
        )}
        {evidence.task_title && (
          <Meta icon={<Calendar size={12} />} label="Task" value={evidence.task_title} />
        )}
        {hasGPS && (
          <Meta
            icon={<MapPin size={12} />}
            label="Location"
            value={`${(evidence.latitude as number).toFixed(5)}, ${(evidence.longitude as number).toFixed(5)}`}
          />
        )}
      </div>

      {/* AI summary */}
      {(ai && (ai.analysis_summary || (ai.detected_issues && ai.detected_issues.length > 0) || ai.recommendations)) ? (
        <div className="evidence-card-ai open">
          <button type="button" className="evidence-card-ai-toggle" onClick={() => setAiOpen((v) => !v)}>
            <Sparkles size={13} />
            <span>AI quality summary</span>
            <ChevronDown size={14} className={`evidence-card-ai-chevron ${aiOpen ? "open" : ""}`} />
          </button>
          {aiOpen && (
            <div className="evidence-card-ai-body">
              {ai.analysis_summary && <p className="text-sm text-white/80 leading-relaxed">{ai.analysis_summary}</p>}
              {ai.detected_issues && ai.detected_issues.length > 0 && (
                <div className="mt-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300/80 mb-1">Detected issues</div>
                  <ul className="text-xs text-white/70 list-disc list-inside space-y-0.5">
                    {ai.detected_issues.map((it, i) => <li key={i}>{it}</li>)}
                  </ul>
                </div>
              )}
              {ai.recommendations && (
                <div className="mt-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/80 mb-1">Recommendations</div>
                  <p className="text-xs text-white/70 whitespace-pre-wrap">{ai.recommendations}</p>
                </div>
              )}
            </div>
          )}
        </div>
      ) : aiProcessing ? (
        <div className="evidence-card-ai">
          <div className="evidence-card-ai-toggle" style={{ cursor: "default" }}>
            <Sparkles size={13} />
            <span>AI analysis in progress…</span>
          </div>
        </div>
      ) : null}

      {/* Actions */}
      {isPending ? (
        <div className="drawer-actions">
          <button type="button" className="drawer-action-approve" disabled={pending} onClick={doApprove}>
            <ThumbsUp size={14} /> Approve
          </button>
          <button type="button" className="drawer-action-reject" disabled={pending} onClick={() => setRejectOpen(true)}>
            <ThumbsDown size={14} /> Reject
          </button>
        </div>
      ) : null}

      {onReAudit && (
        <button
          type="button"
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/70 transition disabled:opacity-50"
          disabled={pending}
          onClick={doReAudit}
        >
          <RefreshCw size={12} /> Re-run AI audit
        </button>
      )}

      {/* Resolve client request — only when this task has a deliverable the client rejected */}
      {rejectedDeliverable && (onUploadEvidence || onResubmitOpen) && (
        <div className="rounded-2xl border px-4 py-4 space-y-3" style={{ background: "color-mix(in srgb, #f59e0b 8%, transparent)", borderColor: "color-mix(in srgb, #f59e0b 30%, transparent)" }}>
          <div className="flex items-start gap-2">
            <RotateCcw size={14} className="mt-0.5 flex-shrink-0" style={{ color: "#f59e0b" }} />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-black uppercase tracking-widest" style={{ color: "#f59e0b" }}>
                Cliente pidió cambios
              </div>
              {rejectedDeliverable.rejection_reason && (
                <p className="text-xs text-white/80 mt-1.5 whitespace-pre-wrap leading-relaxed">
                  {rejectedDeliverable.rejection_reason}
                </p>
              )}
              {rejectedDeliverable.rejection_category && (
                <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest" style={{ background: "rgba(245,158,11,0.18)", color: "#f59e0b" }}>
                  {rejectedDeliverable.rejection_category.replace(/_/g, " ")}
                </span>
              )}
            </div>
          </div>

          {/* Step 1: upload new evidence */}
          {onUploadEvidence && (
            <div className="rounded-xl bg-black/20 border border-white/8 p-3 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/55">
                Paso 1 · Subir nueva evidencia
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,video/*"
                disabled={uploading}
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                className="block w-full text-xs text-white/80 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-[11px] file:font-bold file:uppercase file:tracking-widest file:text-white hover:file:bg-white/15"
              />
              <button
                type="button"
                disabled={!uploadFile || uploading}
                onClick={doUpload}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition disabled:opacity-40"
                style={{ background: "color-mix(in srgb, var(--accent-blue) 22%, transparent)", color: "var(--accent-blue)", border: "1px solid color-mix(in srgb, var(--accent-blue) 40%, transparent)" }}
              >
                <Upload size={12} /> {uploading ? "Subiendo…" : "Subir evidencia"}
              </button>
            </div>
          )}

          {/* Step 2: resubmit deliverable */}
          {onResubmitOpen && (
            <div className="rounded-xl bg-black/20 border border-white/8 p-3 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/55">
                Paso 2 · Reenviar a aprobación
              </div>
              <p className="text-[11px] text-white/55 leading-relaxed">
                Cuando hayas resuelto los cambios y subido nueva evidencia, reenvía al cliente para que la revise.
              </p>
              <button
                type="button"
                onClick={onResubmitOpen}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition"
                style={{ background: "color-mix(in srgb, #10b981 22%, transparent)", color: "#10b981", border: "1px solid color-mix(in srgb, #10b981 40%, transparent)" }}
              >
                <Send size={12} /> Reenviar a aprobación
              </button>
            </div>
          )}
        </div>
      )}

      {/* Basic edit — always available, kept separate from the resolve flow */}
      {onEditTask && (
        <button
          type="button"
          onClick={onEditTask}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/70 transition"
        >
          <Pencil size={12} /> Editar detalles del task
        </button>
      )}

      {/* Reject modal */}
      {rejectOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          onClick={(ev) => { if (ev.target === ev.currentTarget) { setRejectOpen(false); setReason(""); } }}
        >
          <div className="glass-card border-white/10 p-6 max-w-md w-full">
            <h3 className="text-xl font-black text-white mb-2">Reject evidence</h3>
            <p className="text-sm text-white/60 mb-4">Tell the helper what's wrong so they can fix it and re-upload.</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 2000))}
              placeholder="e.g. Photo is blurry; please retake from the same angle in better light."
              className="w-full rounded-xl bg-white/5 border border-white/10 p-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-red-500/40"
              rows={4}
              autoFocus
            />
            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-[10px] text-white/35 font-bold uppercase tracking-widest">{reason.length}/2000</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setRejectOpen(false); setReason(""); }}
                  className="rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 text-sm text-white/70 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!reason.trim() || pending}
                  onClick={doReject}
                  className="rounded-xl bg-red-600 hover:bg-red-500 px-4 py-2 text-sm font-bold text-white transition disabled:opacity-40"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/3 border border-white/5 px-3 py-2 min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-widest text-white/40 inline-flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-xs text-white/85 mt-1 truncate" title={value}>{value}</div>
    </div>
  );
}
