"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X, Star, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { EmptyState } from "./ui/empty-state";
import { useAuthToken } from "./auth-context";
import { aiStatusLabel, aiStatusPillClasses, aiStatusTooltip, canReAudit } from "../lib/ai-status";
import { taskTintStyle } from "../lib/colors";

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

export type AIFeedback = {
  is_valid_evidence?: boolean;
  quality_score?: number;
  analysis_summary?: string;
  detected_issues?: string[];
  recommendations?: string | string[];
  status_logic?: string;
  status?: string;
  message?: string;
  error?: string;
};

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
  task_title?: string;
  uploader_name?: string;
  ai_feedback?: AIFeedback;
  ai_model_version?: string;
  reference_photo_url?: string;
};

type EvidenceGalleryProps = {
  evidences: Evidence[];
  showActions?: boolean;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onReAudit?: (id: string) => void;
  emptyText?: string;
  isMobile?: boolean;
  bulkSelected?: Set<string>;
  onToggleBulk?: (id: string) => void;
  // Map of task_id → color_hex so each card can pick up its task's
  // custom color (tint + left accent border). Optional — gallery falls
  // back to default theme when no entry exists for a task.
  taskColorByTaskId?: Map<string, string>;
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
    case "approved":     return "Aprobada";
    case "committed":    return "Aprobada";
    case "rejected":     return "Rechazada";
    case "pending_approval": return "Pendiente";
    default:             return status;
  }
}

function relativeTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `hace ${days}d`;
  return d.toLocaleDateString("es-MX");
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
  onReAudit,
}: {
  evidences: Evidence[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  showActions?: boolean;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onReAudit?: (id: string) => void;
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

  const fb = evidence.ai_feedback;
  const hasReference = !!evidence.reference_photo_url;
  const issues = Array.isArray(fb?.detected_issues) ? fb!.detected_issues! : [];
  const recs = Array.isArray(fb?.recommendations)
    ? fb!.recommendations as string[]
    : typeof fb?.recommendations === "string" && fb!.recommendations
    ? [fb!.recommendations as string]
    : [];

  return createPortal(
    <div className="lightbox-backdrop" onClick={onClose} aria-modal role="dialog">
      <div className="lightbox-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "1200px", width: "95%" }}>
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

        {hasReference ? (
          <div className="grid md:grid-cols-2 gap-3 p-3">
            <div className="space-y-1">
              <div className="text-[10px] font-black uppercase tracking-widest text-blue-400/80">Referencia</div>
              <AuthImage
                src={evidence.reference_photo_url!}
                alt="Reference"
                className="w-full rounded-xl object-contain"
                style={{ maxHeight: "60vh", background: "#000" }}
              />
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-black uppercase tracking-widest text-green-400/80">Captura</div>
              <AuthImage
                src={evidence.url_archivo}
                alt={evidence.file_name}
                className="w-full rounded-xl object-contain"
                style={{ maxHeight: "60vh", background: "#000" }}
              />
            </div>
          </div>
        ) : (
          <AuthImage
            src={evidence.url_archivo}
            alt={evidence.file_name}
            className="lightbox-image"
          />
        )}

        <div className="lightbox-caption">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{evidence.file_name}</p>
              <p className="mt-1 text-xs text-white/60">
                {evidence.task_title && <span className="text-blue-400">{evidence.task_title}</span>}
                {evidence.uploader_name && <> · subida por {evidence.uploader_name}</>}
                {evidence.created_at && <> · {relativeTime(evidence.created_at)}</>}
                <> · {index + 1} / {evidences.length}</>
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border ${aiStatusPillClasses(evidence.ai_processing_status)}`}
                title={aiStatusTooltip(evidence.ai_processing_status)}
              >
                {aiStatusLabel(evidence.ai_processing_status)}
              </span>
              {evidence.quality_score > 0 && (
                <span
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-sm font-black border border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
                  title="Score de calidad evaluado por la IA"
                >
                  <Star size={14} fill="currentColor" />
                  {evidence.quality_score}/100
                </span>
              )}
              <span className={statusBadgeClass(evidence.status)}>
                {statusLabel(evidence.status)}
              </span>
            </div>
          </div>

          {fb && (fb.analysis_summary || issues.length > 0 || recs.length > 0 || fb.message || fb.error) && (() => {
            const errText = (fb.error || fb.message || "") as string;
            const isQuota = /429|quota|rate.?limit|exceeded/i.test(errText);
            return (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/50">Análisis de IA</div>
                {evidence.ai_model_version && (
                  <div className="text-[9px] text-white/30 font-mono">{evidence.ai_model_version}</div>
                )}
              </div>
              {isQuota && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-300">
                  <div className="font-black text-[11px] uppercase tracking-wider mb-1">Cuota de Gemini agotada</div>
                  <div className="text-[11px] text-amber-200/80">
                    La API de Gemini devolvió 429. El plan gratuito tiene cuota 0 o se consumió. Espera ~1 min y vuelve a auditar, o actualiza tu plan en{" "}
                    <a href="https://ai.google.dev/gemini-api/docs/rate-limits" target="_blank" rel="noreferrer" className="underline">ai.google.dev</a>.
                  </div>
                </div>
              )}
              {fb.analysis_summary && (
                <p className="text-white/80 leading-relaxed">{fb.analysis_summary}</p>
              )}
              {errText && !fb.analysis_summary && !isQuota && (
                <p className="text-red-400/90 leading-relaxed">{errText}</p>
              )}
              {issues.length > 0 && (
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-red-400/70 mb-1">Problemas detectados</div>
                  <ul className="list-disc list-inside text-white/70 space-y-0.5">
                    {issues.map((iss, i) => <li key={i}>{iss}</li>)}
                  </ul>
                </div>
              )}
              {recs.length > 0 && (
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-blue-400/70 mb-1">Recomendaciones</div>
                  <ul className="list-disc list-inside text-white/70 space-y-0.5">
                    {recs.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
            </div>
            );
          })()}

          <div className="mt-3 flex flex-wrap gap-2">
            {showActions && evidence.status === "pending_approval" && onApprove && (
              <button
                className="btn-success"
                onClick={() => { onApprove(evidence.id); onClose(); }}
              >
                <CheckCircle size={14} />
                Aprobar
              </button>
            )}
            {showActions && evidence.status === "pending_approval" && onReject && (
              <button
                className="btn-danger"
                onClick={() => { onReject(evidence.id); onClose(); }}
              >
                <XCircle size={14} />
                Rechazar
              </button>
            )}
            {onReAudit && canReAudit(evidence.ai_processing_status) && (
              <button
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors flex items-center gap-1.5"
                onClick={() => onReAudit(evidence.id)}
              >
                <RefreshCw size={14} />
                Re-auditar IA
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function EvidenceLightboxSingle({
  evidence,
  onClose,
  onApprove,
  onReject,
  onReAudit,
}: {
  evidence: Evidence;
  onClose: () => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onReAudit?: (id: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  return (
    <Lightbox
      evidences={[evidence]}
      index={0}
      onClose={onClose}
      onPrev={() => {}}
      onNext={() => {}}
      showActions={!!(onApprove || onReject)}
      onApprove={onApprove}
      onReject={onReject}
      onReAudit={onReAudit}
    />
  );
}

export function EvidenceGallery({
  evidences,
  showActions,
  onApprove,
  onReject,
  onReAudit,
  emptyText = "No evidence available.",
  isMobile = false,
  bulkSelected,
  onToggleBulk,
  taskColorByTaskId,
}: EvidenceGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Guard against the evidences prop shrinking while the lightbox is open
  // (e.g. a poll refresh drops a rejected item) — avoids indexing past the end.
  useEffect(() => {
    if (lightboxIndex !== null && lightboxIndex >= evidences.length) {
      setLightboxIndex(evidences.length > 0 ? evidences.length - 1 : null);
    }
  }, [evidences, lightboxIndex]);

  if (evidences.length === 0) {
    return <EmptyState text={emptyText} />;
  }

  const prev = () => setLightboxIndex((i) => (i != null && i > 0 ? i - 1 : i));
  const next = () =>
    setLightboxIndex((i) => (i != null && i < evidences.length - 1 ? i + 1 : i));

  return (
    <div ref={containerRef}>
      <div className={`grid gap-3 ${isMobile ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
        {evidences.map((evidence, i) => {
          const selected = bulkSelected?.has(evidence.id) ?? false;
          const bulkMode = !!onToggleBulk;
          const inFlight = evidence.ai_processing_status === "queued" || evidence.ai_processing_status === "processing";
          const taskColor = taskColorByTaskId?.get(evidence.task_id);
          return (
            <div
              key={evidence.id}
              role="button"
              tabIndex={0}
              onClick={() => setLightboxIndex(i)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLightboxIndex(i); } }}
              className={`glass-card overflow-hidden transition-all border cursor-pointer relative ${
                selected ? "border-blue-400/60 ring-2 ring-blue-400/30" : "border-white/5 hover:border-white/20 hover:shadow-lg hover:shadow-black/20"
              }`}
              style={taskTintStyle(taskColor)}
              aria-label={`Ver detalle de ${evidence.file_name}`}
            >
              {bulkMode && (
                <label
                  className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/70 backdrop-blur border border-white/10 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleBulk!(evidence.id)}
                    className="accent-blue-500"
                  />
                  <span className="text-[10px] font-black uppercase tracking-wider text-white/70">Sel</span>
                </label>
              )}
              {inFlight && (
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500/90 backdrop-blur text-white text-[10px] font-black uppercase tracking-wider">
                  <RefreshCw size={10} className="animate-spin" />
                  IA
                </div>
              )}
              {evidence.reference_photo_url ? (
                // Comparison evidence: reference vs capture side-by-side so it
                // visually distinguishes from single-photo cards.
                <div className="relative grid grid-cols-2 gap-px bg-black/40">
                  <div className="relative">
                    <AuthImage
                      src={evidence.reference_photo_url}
                      alt="Reference"
                      className="w-full h-44 object-cover pointer-events-none"
                    />
                    <span className="absolute top-1 left-1 text-[8px] font-black uppercase tracking-widest bg-blue-500/90 text-white px-1.5 py-0.5 rounded">
                      Ref
                    </span>
                  </div>
                  <div className="relative">
                    <AuthImage
                      src={evidence.url_archivo}
                      alt={evidence.file_name}
                      className="w-full h-44 object-cover pointer-events-none"
                    />
                    <span className="absolute top-1 left-1 text-[8px] font-black uppercase tracking-widest bg-green-500/90 text-white px-1.5 py-0.5 rounded">
                      Cap
                    </span>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <AuthImage
                    src={evidence.url_archivo}
                    alt={evidence.file_name}
                    className="w-full h-44 object-cover pointer-events-none"
                  />
                </div>
              )}
              <div className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-white truncate flex-1" title={evidence.file_name}>
                    {evidence.file_name}
                  </p>
                  <span className={statusBadgeClass(evidence.status)}>
                    {statusLabel(evidence.status)}
                  </span>
                </div>
                {evidence.task_title && (
                  <p className="text-[11px] text-blue-400 font-semibold truncate" title={evidence.task_title}>
                    {evidence.task_title}
                  </p>
                )}
                <div className="flex items-center gap-1.5 text-[10px] text-white/40 font-medium">
                  {evidence.uploader_name && <span className="truncate">{evidence.uploader_name}</span>}
                  {evidence.uploader_name && evidence.created_at && <span>·</span>}
                  {evidence.created_at && <span>{relativeTime(evidence.created_at)}</span>}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${aiStatusPillClasses(evidence.ai_processing_status)}`}
                    title={aiStatusTooltip(evidence.ai_processing_status)}
                  >
                    {aiStatusLabel(evidence.ai_processing_status)}
                  </span>
                  {evidence.quality_score > 0 && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border border-yellow-500/30 bg-yellow-500/10 text-yellow-300 flex items-center gap-1">
                      <Star size={10} fill="currentColor" />
                      {evidence.quality_score}/100
                    </span>
                  )}
                </div>
                {showActions && evidence.status === "pending_approval" && (
                  <div className={`flex gap-2 pt-1 ${isMobile ? "flex-col" : ""}`}>
                    <button
                      className={`btn-success ${isMobile ? "w-full" : "flex-1"}`}
                      onClick={(e) => { e.stopPropagation(); onApprove?.(evidence.id); }}
                      aria-label="Aprobar"
                    >
                      <CheckCircle size={13} />
                      Aprobar
                    </button>
                    <button
                      className={`btn-danger ${isMobile ? "w-full" : "flex-1"}`}
                      onClick={(e) => { e.stopPropagation(); onReject?.(evidence.id); }}
                      aria-label="Rechazar"
                    >
                      <XCircle size={13} />
                      Rechazar
                    </button>
                  </div>
                )}
                {onReAudit && canReAudit(evidence.ai_processing_status) && (
                  <button
                    className="w-full mt-1 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors flex items-center justify-center gap-1.5"
                    onClick={(e) => { e.stopPropagation(); onReAudit(evidence.id); }}
                    title={aiStatusTooltip(evidence.ai_processing_status)}
                  >
                    <RefreshCw size={12} />
                    Re-auditar con IA
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

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
          onReAudit={onReAudit}
        />
      )}
    </div>
  );
}
