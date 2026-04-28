"use client";

import { EmptyState } from "./ui/empty-state";
import { EvidenceGallery } from "./evidence-gallery";
import { HealthPill } from "./client/health-pill";
import { ProgressDonut } from "./client/progress-donut";
import { CheckCircle2, Clock3, ThumbsUp, ThumbsDown, Calendar, Wallet, Flag, ListChecks } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "./ui/confirm-dialog";

type Deliverable = {
  id: string;
  task_id: string;
  title: string;
  description?: string;
  due_date: string;
  status: string;
  client_visible: boolean;
  approved_by_user_id?: string;
  approved_by_name?: string;
  approved_at?: string;
  rejection_reason?: string;
  task_title?: string;
};
type Evidence = { id: string; task_id: string; file_name: string; url_archivo: string; quality_score: number; status: string; ai_processing_status: string; is_visible_to_client: boolean; created_at?: string };
type NextMilestone = { id: string; title: string; due_date: string; days_until: number };
type DeliverablesBreakdown = { approved: number; pending: number; rejected: number; total: number };
type ClientSummary = {
  project_name: string;
  timeline_progress: number;
  budget_spent_percent: number;
  budget_total_cents?: number;
  budget_spent_cents?: number;
  budget_remaining_cents?: number;
  health_status?: "on_track" | "at_risk" | "delayed" | "completed";
  eta_date?: string;
  next_milestone?: NextMilestone | null;
  deliverables_breakdown?: DeliverablesBreakdown;
  deliverables: Deliverable[];
  gallery: Evidence[];
};

type ClientCanvasProps = {
  activeView: string;
  clientSummary: ClientSummary | null;
  selectedTaskId?: string | null;
  onDeliverableClick: (deliverableId: string, taskId?: string) => void;
  onClearTaskFilter?: () => void;
  onApproveDeliverable?: (deliverableId: string) => Promise<void>;
  onRejectDeliverable?: (deliverableId: string, reason: string) => Promise<void>;
  isMobile?: boolean;
};

function formatMoney(cents?: number) {
  if (cents === undefined || cents === null) return "—";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(cents / 100);
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

function relativeDays(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 0) return `In ${days} days`;
  return `${Math.abs(days)} days overdue`;
}

export function ClientCanvas({
  activeView,
  clientSummary,
  selectedTaskId,
  onDeliverableClick,
  onClearTaskFilter,
  onApproveDeliverable,
  onRejectDeliverable,
  isMobile = false,
}: ClientCanvasProps) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [confirmApproveId, setConfirmApproveId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function doApprove(id: string) {
    if (!onApproveDeliverable) return;
    setPendingAction(id);
    try {
      await onApproveDeliverable(id);
      toast.success("Deliverable approved");
    } catch (e) {
      toast.error((e as Error).message || "Could not approve");
    } finally {
      setPendingAction(null);
      setConfirmApproveId(null);
    }
  }

  async function doReject() {
    if (!onRejectDeliverable || !rejectingId) return;
    setPendingAction(rejectingId);
    try {
      await onRejectDeliverable(rejectingId, rejectReason);
      toast.success("Deliverable rejected");
    } catch (e) {
      toast.error((e as Error).message || "Could not reject");
    } finally {
      setPendingAction(null);
      setRejectingId(null);
      setRejectReason("");
    }
  }

  const gallery = clientSummary?.gallery ?? [];
  const filteredGallery = selectedTaskId
    ? gallery.filter((evidence) => evidence.task_id === selectedTaskId)
    : gallery;

  if (activeView === "summary") {
    const breakdown = clientSummary?.deliverables_breakdown ?? { approved: 0, pending: 0, rejected: 0, total: clientSummary?.deliverables.length ?? 0 };
    const next = clientSummary?.next_milestone ?? null;
    const progress = clientSummary?.timeline_progress ?? 0;

    return (
      <div className={`space-y-8 animate-fade-in ${isMobile ? "pb-20" : ""}`}>
        {/* HERO ZONE */}
        <div className="client-hero">
          <div className="client-hero-header">
            <div className="min-w-0">
              <div className="client-hero-eyebrow">Project portal</div>
              <h1 className={`${isMobile ? "text-2xl" : "text-4xl"} font-black text-white tracking-tight leading-none mt-1`}>
                {clientSummary?.project_name ?? "Project Summary"}
              </h1>
            </div>
            <HealthPill status={clientSummary?.health_status} />
          </div>

          <div className="client-hero-grid">
            <div className="client-hero-donut">
              <ProgressDonut
                value={progress}
                size={isMobile ? 140 : 184}
                strokeWidth={isMobile ? 12 : 14}
                label="Overall progress"
                sublabel={`${breakdown.approved} of ${breakdown.total} deliverables`}
              />
            </div>

            <div className="client-hero-stats">
              <HeroStat
                icon={<Flag size={16} />}
                label="Next milestone"
                value={next?.title ?? "All approved"}
                hint={next ? relativeDays(next.days_until) : "No pending milestones"}
                tone={next && next.days_until < 0 ? "warn" : "default"}
              />
              <HeroStat
                icon={<Calendar size={16} />}
                label="Estimated completion"
                value={formatDate(clientSummary?.eta_date)}
                hint={
                  clientSummary?.health_status === "completed"
                    ? "Project completed"
                    : clientSummary?.health_status === "delayed"
                    ? "Past planned end"
                    : "Based on remaining tasks"
                }
              />
              <HeroStat
                icon={<Wallet size={16} />}
                label="Budget remaining"
                value={formatMoney(clientSummary?.budget_remaining_cents)}
                hint={`${clientSummary?.budget_spent_percent ?? 0}% spent`}
                tone={(clientSummary?.budget_spent_percent ?? 0) > 100 ? "warn" : "default"}
              />
              <HeroStat
                icon={<ListChecks size={16} />}
                label="Deliverables"
                value={`${breakdown.approved} / ${breakdown.total}`}
                hint={
                  breakdown.rejected > 0
                    ? `${breakdown.pending} pending · ${breakdown.rejected} need changes`
                    : `${breakdown.pending} pending`
                }
                tone={breakdown.rejected > 0 ? "warn" : "default"}
              />
            </div>
          </div>
        </div>

        {/* DELIVERABLES LIST (PR-B will replace with timeline) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-white/40">
              Deliverables and Milestones
            </h2>
            <div className="h-px flex-1 bg-white/5 mx-4" />
          </div>

          {(clientSummary?.deliverables ?? []).length === 0 ? (
            <div className="glass-card p-12 text-center border-dashed border-white/10">
              <EmptyState text="No visible deliverables at this time." />
            </div>
          ) : (
            <div className="grid gap-3">
              {(clientSummary?.deliverables ?? []).map((d) => {
                const canAct = !!onApproveDeliverable && d.status !== "approved";
                return (
                  <div
                    key={d.id}
                    className="glass-card p-5 flex items-center justify-between group hover:bg-white/10 transition-all border-white/5"
                  >
                    <button
                      type="button"
                      className="flex items-center gap-4 flex-1 text-left active:scale-[0.99]"
                      onClick={() => onDeliverableClick(d.id, d.task_id)}
                      title="Open approved evidence for this deliverable"
                    >
                      <div className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-colors shadow-lg ${
                        d.status === "approved" ? "bg-green-500/10 text-green-400 shadow-green-500/5 group-hover:bg-green-500/20" : "bg-amber-500/10 text-amber-400 shadow-amber-500/5 group-hover:bg-amber-500/20"
                      }`}>
                        {d.status === "approved" ? <CheckCircle2 size={24} /> : <Clock3 size={24} />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-base font-bold text-white group-hover:text-blue-400 transition-colors tracking-tight truncate">{d.title}</div>
                        <div className="text-xs text-white/40 font-medium flex items-center gap-2">
                          <span>Due: {formatDate(d.due_date)}</span>
                          {d.task_title && <span className="text-white/25">·</span>}
                          {d.task_title && <span className="truncate">{d.task_title}</span>}
                        </div>
                        {d.status === "approved" && d.approved_by_name && (
                          <div className="text-[11px] text-green-400/80 mt-1">
                            Approved by {d.approved_by_name}
                            {d.approved_at && ` on ${formatDate(d.approved_at)}`}
                          </div>
                        )}
                        {d.status === "rejected" && d.rejection_reason && (
                          <div className="text-[11px] text-red-400/80 mt-1 line-clamp-1">
                            Changes requested: {d.rejection_reason}
                          </div>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                        d.status === "approved" ? "bg-green-500/10 text-green-400 border-green-500/20" : d.status === "rejected" ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      }`}>
                        {d.status === "approved" ? "Approved ✓" : d.status === "rejected" ? "Rejected" : "In Progress"}
                      </span>
                      {canAct && (
                        <>
                          <button
                            type="button"
                            disabled={pendingAction === d.id}
                            onClick={() => setConfirmApproveId(d.id)}
                            className="rounded-xl bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 px-3 py-2 text-green-400 transition-all disabled:opacity-40"
                            title="Approve"
                          >
                            <ThumbsUp size={16} />
                          </button>
                          <button
                            type="button"
                            disabled={pendingAction === d.id}
                            onClick={() => setRejectingId(d.id)}
                            className="rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-3 py-2 text-red-400 transition-all disabled:opacity-40"
                            title="Reject"
                          >
                            <ThumbsDown size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <ConfirmDialog
            open={!!confirmApproveId}
            title="Approve deliverable?"
            body="Once approved, the deliverable will be marked as completed and the project owner will be notified."
            confirmLabel="Approve"
            onConfirm={() => { if (confirmApproveId) doApprove(confirmApproveId); }}
            onCancel={() => setConfirmApproveId(null)}
          />
          {rejectingId && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
              onClick={(e) => { if (e.target === e.currentTarget) { setRejectingId(null); setRejectReason(""); } }}
            >
              <div className="glass-card border-white/10 p-6 max-w-md w-full">
                <h3 className="text-xl font-black text-white mb-2">Reject deliverable</h3>
                <p className="text-sm text-white/60 mb-4">Tell the team what needs to change. The owner will see this reason.</p>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection..."
                  className="w-full rounded-xl bg-white/5 border border-white/10 p-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-red-500/40"
                  rows={4}
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { setRejectingId(null); setRejectReason(""); }}
                    className="rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 text-sm text-white/70 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!rejectReason.trim() || !!pendingAction}
                    onClick={doReject}
                    className="rounded-xl bg-red-600 hover:bg-red-500 px-4 py-2 text-sm font-bold text-white transition-all disabled:opacity-40"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (activeView === "gallery") {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="executive-header">
          <h1 className="text-3xl font-black text-white tracking-tight">Approved Gallery</h1>
          <p className="mt-2 text-sm text-white/50 font-medium">
            Curated photo memory of completed milestones in your project.
          </p>
        </div>
        <div className="glass-card p-8 border-white/5">
          {selectedTaskId && (
            <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-3">
              <div className="text-xs font-bold uppercase tracking-widest text-blue-200">
                Showing approved evidence for the selected deliverable
              </div>
              <button
                type="button"
                className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/80 transition-colors hover:bg-white/5"
                onClick={onClearTaskFilter}
              >
                Show all
              </button>
            </div>
          )}
          <EvidenceGallery
            evidences={filteredGallery}
            emptyText="There is no approved evidence to display yet."
          />
        </div>
      </div>
    );
  }

  return null;
}

function HeroStat({
  icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className={`client-hero-stat ${tone === "warn" ? "client-hero-stat-warn" : ""}`}>
      <div className="client-hero-stat-label">
        <span className="client-hero-stat-icon">{icon}</span>
        {label}
      </div>
      <div className="client-hero-stat-value" title={value}>{value}</div>
      {hint && <div className="client-hero-stat-hint">{hint}</div>}
    </div>
  );
}
