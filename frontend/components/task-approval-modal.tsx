"use client";

import { useState } from "react";
import { X, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Star, Clock, Cpu, Eye } from "lucide-react";
import { aiStatusLabel } from "../lib/ai-status";
import { withAccessToken } from "../lib/files";

type Evidence = {
  id: string;
  task_id: string;
  file_name: string;
  url_archivo: string;
  quality_score: number;
  status: string;
  ai_processing_status: string;
  is_visible_to_client: boolean;
  created_at?: string;
};

type TaskApprovalModalProps = {
  open: boolean;
  onClose: () => void;
  evidences: Evidence[];
  initialIndex?: number;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  loading: boolean;
  // JWT for authenticating /api/v1/files/* img loads (see lib/files.ts).
  accessToken?: string;
};

function qualityColor(score: number) {
  if (score >= 80) return "#10b981";
  if (score >= 55) return "#f59e0b";
  return "#ef4444";
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
}

export function TaskApprovalModal({
  open,
  onClose,
  evidences,
  initialIndex = 0,
  onApprove,
  onReject,
  loading,
  accessToken,
}: TaskApprovalModalProps) {
  const [idx, setIdx]           = useState(initialIndex);
  const [comment, setComment]   = useState("");
  const [deciding, setDeciding] = useState<"approve" | "reject" | null>(null);
  const [decided, setDecided]   = useState<Record<string, "approve" | "reject">>({});

  if (!open || evidences.length === 0) return null;

  const evidence = evidences[Math.min(idx, evidences.length - 1)];
  const isPending = evidence.status === "pending_approval";
  const alreadyDecided = decided[evidence.id];

  const handleDecision = async (action: "approve" | "reject") => {
    setDeciding(action);
    try {
      if (action === "approve") await onApprove(evidence.id);
      else await onReject(evidence.id);
      const currentEvidenceId = evidence.id;
      setDecided((prev) => ({ ...prev, [currentEvidenceId]: action }));
      setComment("");
      // Auto-advance to next pending if available (include current ID in exclusion)
      const nextIdx = evidences.findIndex((e, i) => i > idx && e.status === "pending_approval" && !decided[e.id] && e.id !== currentEvidenceId);
      if (nextIdx !== -1) setIdx(nextIdx);
    } finally {
      setDeciding(null);
    }
  };

  const prev = () => setIdx((i) => Math.max(0, i - 1));
  const next = () => setIdx((i) => Math.min(evidences.length - 1, i + 1));

  const hasFallback = !evidence.url_archivo;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !loading && onClose()}>
      <div className="modal-sheet" style={{ maxWidth: 620 }}>
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #0ea5e9, #0369a1)" }}
            >
              <Eye size={18} className="text-white" />
            </div>
            <div>
              <div className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                Evidence Review
              </div>
              <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {idx + 1} of {evidences.length} · {evidences.filter((e) => e.status === "pending_approval").length} pending
              </div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} disabled={loading} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body space-y-4">
          {/* Image area */}
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{ background: "#0f1117", minHeight: 280 }}
          >
            {hasFallback ? (
              <div className="flex flex-col items-center justify-center h-64 gap-2" style={{ color: "#4b5563" }}>
                <div className="text-4xl">📸</div>
                <div className="text-xs">Preview unavailable</div>
              </div>
            ) : (
              <img
                src={withAccessToken(evidence.url_archivo, accessToken)}
                alt={evidence.file_name}
                className="w-full object-contain"
                style={{ maxHeight: 340 }}
              />
            )}

            {/* Score badge overlay */}
            {evidence.quality_score > 0 && (
              <div
                className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold"
                style={{
                  background: "rgba(0,0,0,0.7)",
                  color: qualityColor(evidence.quality_score),
                  backdropFilter: "blur(8px)",
                }}
              >
                <Star size={12} />
                {evidence.quality_score}/100
              </div>
            )}

            {/* Status badge overlay */}
            {(alreadyDecided || !isPending) && (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  background: alreadyDecided === "approve" || evidence.status === "approved"
                    ? "rgba(16,185,129,0.18)"
                    : "rgba(220,38,38,0.15)",
                }}
              >
                <div
                  className="flex flex-col items-center gap-2 rounded-2xl px-8 py-6"
                  style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(16px)" }}
                >
                  {alreadyDecided === "approve" || evidence.status === "approved" ? (
                    <>
                      <CheckCircle2 size={40} style={{ color: "#10b981" }} />
                      <span className="text-sm font-bold text-white">Approved</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={40} style={{ color: "#ef4444" }} />
                      <span className="text-sm font-bold text-white">Rejected</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Navigation arrows */}
            {evidences.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prev}
                  disabled={idx === 0}
                  className="absolute left-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30"
                  style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", color: "white", border: "none", cursor: "pointer" }}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={next}
                  disabled={idx === evidences.length - 1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30"
                  style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", color: "white", border: "none", cursor: "pointer" }}
                >
                  <ChevronRight size={18} />
                </button>
              </>
            )}
          </div>

          {/* Metadata row */}
          <div className="grid grid-cols-3 gap-2">
            <MetaChip icon={<Clock size={12} />} label="Uploaded" value={formatDate(evidence.created_at)} />
            <MetaChip
              icon={<Cpu size={12} />}
              label="AI status"
              value={aiStatusLabel(evidence.ai_processing_status)}
            />
            <MetaChip
              icon={<Eye size={12} />}
              label="Client visible"
              value={evidence.is_visible_to_client ? "Yes" : "No"}
            />
          </div>

          {/* File name */}
          <div
            className="text-xs px-3 py-2 rounded-xl truncate"
            style={{ background: "rgba(0,0,0,0.04)", color: "var(--text-secondary)", fontFamily: "monospace" }}
          >
            📎 {evidence.file_name}
          </div>

          {/* Comment field (only for pending) */}
          {isPending && !alreadyDecided && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                Comment (optional)
              </label>
              <textarea
                className="form-input resize-none"
                rows={2}
                placeholder="Add a comment for the operator..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                style={{ lineHeight: 1.5 }}
              />
            </div>
          )}

          {/* Thumbnail strip */}
          {evidences.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {evidences.map((e, i) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setIdx(i)}
                  className="flex-shrink-0 relative w-14 h-14 rounded-xl overflow-hidden transition-all"
                  style={{
                    border: i === idx ? "2px solid #0ea5e9" : "2px solid transparent",
                    background: "#f3f4f6",
                    opacity: i === idx ? 1 : 0.6,
                  }}
                >
                  {e.url_archivo ? (
                    <img src={withAccessToken(e.url_archivo, accessToken)} alt={e.file_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-lg">📸</div>
                  )}
                  {(decided[e.id] === "approve" || e.status === "approved") && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(16,185,129,0.4)" }}>
                      <CheckCircle2 size={16} className="text-white" />
                    </div>
                  )}
                  {(decided[e.id] === "reject" || e.status === "rejected") && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(220,38,38,0.4)" }}>
                      <XCircle size={16} className="text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
            Close
          </button>
          {isPending && !alreadyDecided && (
            <>
              <button
                type="button"
                className="btn-danger"
                disabled={loading || deciding !== null}
                onClick={() => handleDecision("reject")}
                style={{ minWidth: 110 }}
              >
                {deciding === "reject" ? <><span className="spinner" /> Rejecting…</> : <><XCircle size={14} /> Reject</>}
              </button>
              <button
                type="button"
                className="btn-success"
                disabled={loading || deciding !== null}
                onClick={() => handleDecision("approve")}
                style={{ minWidth: 110 }}
              >
                {deciding === "approve" ? <><span className="spinner" /> Approving…</> : <><CheckCircle2 size={14} /> Approve</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MetaChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-xl px-3 py-2.5"
      style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)" }}
    >
      <div className="flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}
