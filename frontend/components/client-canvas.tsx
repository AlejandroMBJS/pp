"use client";

import { EmptyState } from "./ui/empty-state";
import { EvidenceGallery, type AIFeedback } from "./evidence-gallery";
import { HealthPill } from "./client/health-pill";
import { ProgressDonut } from "./client/progress-donut";
import { DeliverablesTimeline } from "./client/deliverables-timeline";
import { DeliverableDrawerContent } from "./client/deliverable-drawer";
import { ActivityFeed } from "./client/activity-feed";
import { EvidenceShowcase } from "./client/evidence-showcase";
import { Drawer } from "./ui/drawer";
import { Calendar, Wallet, Flag, ListChecks, Activity } from "lucide-react";
import { useState } from "react";

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
  approval_comment?: string;
  rejection_reason?: string;
  rejection_category?: string;
  task_title?: string;
};
type Evidence = {
  id: string;
  task_id: string;
  file_name: string;
  url_archivo: string;
  reference_photo_url?: string;
  quality_score: number;
  status: string;
  ai_processing_status: string;
  ai_feedback?: AIFeedback;
  is_visible_to_client: boolean;
  created_at?: string;
  uploader_name?: string;
};
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
  accessToken?: string;
  projectId?: string;
  apiBase?: string;
  onDeliverableClick: (deliverableId: string, taskId?: string) => void;
  onClearTaskFilter?: () => void;
  onApproveDeliverable?: (deliverableId: string, comment: string) => Promise<void>;
  onRejectDeliverable?: (deliverableId: string, reason: string, category: string) => Promise<void>;
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
  accessToken,
  projectId,
  apiBase = "",
  onDeliverableClick,
  onClearTaskFilter,
  onApproveDeliverable,
  onRejectDeliverable,
  isMobile = false,
}: ClientCanvasProps) {
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);

  const gallery = clientSummary?.gallery ?? [];
  const filteredGallery = selectedTaskId
    ? gallery.filter((evidence) => evidence.task_id === selectedTaskId)
    : gallery;

  const drawerDeliverable = drawerId ? clientSummary?.deliverables.find((d) => d.id === drawerId) ?? null : null;

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

        {/* TIMELINE */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-white/40">
              Deliverables and Milestones
            </h2>
            <div className="h-px flex-1 bg-white/5 mx-4" />
            <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest">
              Click to review
            </span>
          </div>

          {(clientSummary?.deliverables ?? []).length === 0 ? (
            <div className="glass-card p-12 text-center border-dashed border-white/10">
              <EmptyState text="No visible deliverables at this time." />
            </div>
          ) : (
            <DeliverablesTimeline
              deliverables={clientSummary?.deliverables ?? []}
              selectedId={drawerId}
              onSelect={(id) => setDrawerId(id)}
              isMobile={isMobile}
            />
          )}
        </div>

        {/* ACTIVITY FEED */}
        {projectId && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest text-white/40 inline-flex items-center gap-2">
                <Activity size={14} /> Recent activity
              </h2>
              <div className="h-px flex-1 bg-white/5 mx-4" />
            </div>
            <ActivityFeed projectId={projectId} apiBase={apiBase} accessToken={accessToken} refreshKey={activityRefreshKey} />
          </div>
        )}

        {/* DRAWER */}
        <Drawer
          open={!!drawerId}
          onClose={() => setDrawerId(null)}
          title={drawerDeliverable?.title}
          subtitle={drawerDeliverable?.task_title || "Deliverable details"}
          width={isMobile ? 9999 : 480}
        >
          <DeliverableDrawerContent
            deliverable={drawerDeliverable}
            evidences={gallery}
            accessToken={accessToken}
            canAct={!!onApproveDeliverable}
            onApprove={onApproveDeliverable ? async (id, comment) => { await onApproveDeliverable(id, comment); setDrawerId(null); setActivityRefreshKey((k) => k + 1); } : undefined}
            onReject={onRejectDeliverable ? async (id, r, cat) => { await onRejectDeliverable(id, r, cat); setDrawerId(null); setActivityRefreshKey((k) => k + 1); } : undefined}
            onEvidenceClick={(taskId) => {
              if (drawerDeliverable) {
                onDeliverableClick(drawerDeliverable.id, taskId);
              }
              setDrawerId(null);
            }}
          />
        </Drawer>
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
        {selectedTaskId ? (
          <div className="glass-card p-8 border-white/5">
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
            <EvidenceGallery
              evidences={filteredGallery}
              emptyText="There is no approved evidence to display yet."
            />
          </div>
        ) : (
          <EvidenceShowcase
            deliverables={clientSummary?.deliverables ?? []}
            evidences={gallery}
            accessToken={accessToken}
            onEvidenceClick={(taskId) => onDeliverableClick("", taskId)}
          />
        )}
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
