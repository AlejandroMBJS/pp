"use client";

import { useEffect } from "react";
import { X, Star, Calendar } from "lucide-react";
import { withAccessToken } from "../lib/files";

type Evidence = {
  id: string;
  task_id: string;
  file_name: string;
  url_archivo: string;
  quality_score: number;
  status: string;
  created_at?: string;
};

type Props = {
  evidence: Evidence | null;
  onClose: () => void;
  accessToken?: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending_approval: "#f59e0b",
  approved: "#10b981",
  committed: "#10b981",
  rejected: "#ef4444",
  needs_review: "#0ea5e9",
};

function fmtDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Lightweight read-only lightbox for an evidence photo. Opened from the
 * Gantt photo-pin click. No edit/approve actions — just preview + meta.
 * Approve/reject lives in the review queue and TaskApprovalModal.
 */
export function EvidencePreviewModal({ evidence, onClose, accessToken }: Props) {
  useEffect(() => {
    if (!evidence) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [evidence, onClose]);

  if (!evidence) return null;
  const statusColor = STATUS_COLORS[evidence.status] ?? "#9ca3af";

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-sheet" style={{ maxWidth: 720, width: "100%" }}>
        <div className="modal-header">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="text-base font-bold text-white truncate" title={evidence.file_name}>
              {evidence.file_name}
            </div>
            <span
              className="evidence-preview-pill"
              style={{
                color: statusColor,
                background: `${statusColor}26`,
                border: `1px solid ${statusColor}66`,
              }}
            >
              {evidence.status.replace(/_/g, " ")}
            </span>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: 0 }}>
          <div className="evidence-preview-image-wrap">
            <img
              src={withAccessToken(evidence.url_archivo, accessToken)}
              alt={evidence.file_name}
              className="evidence-preview-image"
              onError={(ev) => {
                (ev.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
            {evidence.quality_score > 0 && (
              <div className="evidence-preview-score">
                <Star size={12} /> {evidence.quality_score}/100
              </div>
            )}
          </div>
          <div className="evidence-preview-meta">
            <div className="evidence-preview-meta-row">
              <Calendar size={12} className="text-white/40" />
              <span className="text-white/60 text-xs">Captured</span>
              <span className="text-white text-xs font-semibold ml-auto">
                {fmtDate(evidence.created_at)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
