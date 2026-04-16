"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X, Star, CheckCircle, XCircle } from "lucide-react";
import { EmptyState } from "./ui/empty-state";
import { useAuthToken } from "./auth-context";

function browserSafeURL(rawUrl: string) {
  if (typeof window === "undefined" || !rawUrl) return rawUrl;
  try {
    const current = new URL(window.location.origin);
    const candidate = new URL(rawUrl, current.origin);
    const internalPath =
      candidate.pathname.startsWith("/uploads/") || candidate.pathname.startsWith("/api/");
    const localHost = ["localhost", "127.0.0.1", "0.0.0.0", "backend", "frontend", "gateway"].includes(
      candidate.hostname
    );
    if ((internalPath || localHost) && candidate.origin !== current.origin) {
      return `${current.origin}${candidate.pathname}${candidate.search}`;
    }
    return candidate.toString();
  } catch {
    return rawUrl;
  }
}

/** Fetches an authenticated URL and renders it as a blob-URL <img>. */
function AuthImage({
  src,
  alt,
  className,
  style,
  onError,
}: {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}) {
  const token = useAuthToken();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!src) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    setLoadError(false);
    const safeSrc = browserSafeURL(src);

    async function load() {
      try {
        const res = await fetch(safeSrc, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok || cancelled) {
          if (!cancelled) setLoadError(true);
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, token]);

  if (loadError) {
    return (
      <div
        className={className}
        style={{ background: "#1e293b", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, ...style }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="3" x2="21" y2="21"/></svg>
        <span style={{ color: "#475569", fontSize: 10, fontWeight: 600 }}>Error</span>
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div
        className={className}
        style={{ background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", ...style }}
      />
    );
  }

  return <img src={blobUrl} alt={alt} className={className} style={style} onError={onError} />;
}

type Evidence = {
  id: string;
  task_id: string;
  file_name: string;
  status: string;
  quality_score: number;
  is_visible_to_client: boolean;
  ai_processing_status: string;
  url_archivo: string;
  created_at?: string;
};

type EvidenceGalleryProps = {
  evidences: Evidence[];
  showActions?: boolean;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  emptyText?: string;
  isMobile?: boolean;
};

function statusBadgeClass(status: string) {
  switch (status) {
    case "approved":
    case "committed":
      return "badge badge-green";
    case "rejected":
      return "badge badge-red";
    case "pending_approval":
      return "badge badge-amber";
    default:
      return "badge badge-gray";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "approved":     return "Approved";
    case "committed":    return "Committed";
    case "rejected":     return "Rejected";
    case "pending_approval": return "Pending";
    default:             return status;
  }
}

function Lightbox({
  evidences,
  index,
  onClose,
  onPrev,
  onNext,
  showActions,
  onApprove,
  onReject,
}: {
  evidences: Evidence[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  showActions?: boolean;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}) {
  const evidence = evidences[index];

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, onPrev, onNext]);

  if (!evidence) return null;

  return createPortal(
    <div className="lightbox-backdrop" onClick={onClose} aria-modal role="dialog">
      <div className="lightbox-modal" onClick={(e) => e.stopPropagation()}>
        <button className="lightbox-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>

        {index > 0 && (
          <button className="lightbox-nav prev" onClick={onPrev} aria-label="Previous">
            <ChevronLeft size={20} />
          </button>
        )}
        {index < evidences.length - 1 && (
          <button className="lightbox-nav next" onClick={onNext} aria-label="Next">
            <ChevronRight size={20} />
          </button>
        )}

        <AuthImage
          src={evidence.url_archivo}
          alt={evidence.file_name}
          className="lightbox-image"
        />

        <div className="lightbox-caption">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-white">{evidence.file_name}</p>
              <p className="mt-1 text-xs text-white/60">
                {index + 1} / {evidences.length}
                {evidence.created_at && (
                  <> · {new Date(evidence.created_at).toLocaleDateString("en-US")}</>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {evidence.quality_score > 0 && (
                <span className="flex items-center gap-1 text-xs text-yellow-300">
                  <Star size={12} fill="currentColor" />
                  {evidence.quality_score}
                </span>
              )}
              <span className={statusBadgeClass(evidence.status)}>
                {statusLabel(evidence.status)}
              </span>
            </div>
          </div>
          {showActions && evidence.status === "pending_approval" && (
            <div className="mt-3 flex gap-2">
              <button
                className="btn-success"
                onClick={() => { onApprove?.(evidence.id); onClose(); }}
              >
                <CheckCircle size={14} />
                Approve
              </button>
              <button
                className="btn-danger"
                onClick={() => { onReject?.(evidence.id); onClose(); }}
              >
                <XCircle size={14} />
                Reject
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Standalone single-evidence lightbox (for Gantt pin clicks) ─────────────
export function EvidenceLightboxSingle({
  evidence,
  onClose,
  onApprove,
  onReject,
}: {
  evidence: Evidence;
  onClose: () => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="lightbox-backdrop" onClick={onClose} aria-modal role="dialog">
      <div className="lightbox-modal" onClick={(e) => e.stopPropagation()}>
        <button className="lightbox-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
        <AuthImage
          src={evidence.url_archivo}
          alt={evidence.file_name}
          className="lightbox-image"
        />
        <div className="lightbox-caption">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-white">{evidence.file_name}</p>
              <p className="mt-1 text-xs text-white/60">
                IA: {evidence.ai_processing_status}
                {evidence.created_at && (
                  <> · {new Date(evidence.created_at).toLocaleDateString("en-US")}</>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {evidence.quality_score > 0 && (
                <span className="flex items-center gap-1 text-xs text-yellow-300">
                  <Star size={12} fill="currentColor" />
                  {evidence.quality_score}
                </span>
              )}
              <span className={statusBadgeClass(evidence.status)}>
                {statusLabel(evidence.status)}
              </span>
            </div>
          </div>
          {(onApprove || onReject) && evidence.status === "pending_approval" && (
            <div className="mt-3 flex gap-2">
              {onApprove && (
                <button
                  className="btn-success"
                  onClick={() => { onApprove(evidence.id); onClose(); }}
                >
                  <CheckCircle size={14} /> Approve
                </button>
              )}
              {onReject && (
                <button
                  className="btn-danger"
                  onClick={() => { onReject(evidence.id); onClose(); }}
                >
                  <XCircle size={14} /> Reject
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function EvidenceGallery({
  evidences,
  showActions,
  onApprove,
  onReject,
  emptyText = "No evidence available.",
  isMobile = false,
}: EvidenceGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (evidences.length === 0) {
    return <EmptyState text={emptyText} />;
  }

  const prev = () => setLightboxIndex((i) => (i != null && i > 0 ? i - 1 : i));
  const next = () =>
    setLightboxIndex((i) => (i != null && i < evidences.length - 1 ? i + 1 : i));

  return (
    <div ref={containerRef}>
      <div className="gallery-grid">
        {evidences.map((evidence, i) => (
          <button
            key={evidence.id}
            type="button"
            className="gallery-card"
            onClick={() => setLightboxIndex(i)}
            aria-label={`View ${evidence.file_name}`}
          >
            <AuthImage
              src={evidence.url_archivo}
              alt={evidence.file_name}
              className="w-full h-40 object-cover"
            />
            <div className="gallery-overlay">
              <div className="flex items-center justify-between gap-2">
                {evidence.quality_score > 0 && (
                  <span className="flex items-center gap-1 text-xs text-yellow-300">
                    <Star size={10} fill="currentColor" />
                    {evidence.quality_score}
                  </span>
                )}
                <span className={statusBadgeClass(evidence.status)}>
                  {statusLabel(evidence.status)}
                </span>
              </div>
              <p className="truncate text-xs text-white/80">{evidence.file_name}</p>
            </div>
          </button>
        ))}
      </div>

      {showActions && (
        <div className="mt-4 space-y-2">
          {evidences
            .filter((e) => e.status === "pending_approval")
            .map((evidence) => (
              <div
                key={evidence.id}
                className="flex items-center justify-between rounded-xl px-4 py-3"
                style={{ border: "1px solid rgba(245,158,11,0.25)", background: "rgba(245,158,11,0.1)" }}
              >
                <div>
                  <p className="text-sm font-semibold text-white">{evidence.file_name}</p>
                  <p className="text-xs text-white/50">
                    IA: {evidence.ai_processing_status}
                  </p>
                </div>
                <div className={`flex ${isMobile ? 'flex-col gap-2' : 'gap-2'}`}>
                  <button
                    className={`${isMobile ? 'min-h-[48px] flex-1' : ''} btn-success`}
                    onClick={() => onApprove?.(evidence.id)}
                    aria-label="Approve evidence"
                  >
                    <CheckCircle size={13} />
                    {isMobile ? 'Approve' : 'Approve'}
                  </button>
                  <button
                    className={`${isMobile ? 'min-h-[48px] flex-1' : ''} btn-danger`}
                    onClick={() => onReject?.(evidence.id)}
                    aria-label="Reject evidence"
                  >
                    <XCircle size={13} />
                    {isMobile ? 'Reject' : 'Reject'}
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {mounted && lightboxIndex !== null && (
        <Lightbox
          evidences={evidences}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={prev}
          onNext={next}
          showActions={showActions}
          onApprove={onApprove}
          onReject={onReject}
        />
      )}
    </div>
  );
}
