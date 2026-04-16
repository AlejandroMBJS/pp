"use client";

import { MetricCard } from "./ui/metric-card";
import { EmptyState } from "./ui/empty-state";
import { ProgressBar } from "./ui/progress-bar";
import { EvidenceGallery } from "./evidence-gallery";
import { CheckCircle2, Clock3, ThumbsUp, ThumbsDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "./ui/confirm-dialog";

type Deliverable = { id: string; task_id: string; title: string; due_date: string; status: string; client_visible: boolean };
type Evidence = { id: string; task_id: string; file_name: string; url_archivo: string; quality_score: number; status: string; ai_processing_status: string; is_visible_to_client: boolean; created_at?: string };
type ClientSummary = { project_name: string; timeline_progress: number; budget_spent_percent: number; deliverables: Deliverable[]; gallery: Evidence[] };

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
    return (
      <div className={`space-y-8 animate-fade-in ${isMobile ? 'pb-20' : ''}`}>
        <div className="executive-header">
          <h1 className={`${isMobile ? 'text-2xl' : 'text-4xl'} font-black text-white tracking-tight leading-none`}>
            {clientSummary?.project_name ?? "Project Summary"}
          </h1>
          <p className="mt-2 text-sm text-white/50 font-medium">
            {isMobile ? 'Project progress overview' : 'Curated technical and financial view for tracking your project.'}
          </p>
        </div>

        {isMobile ? (
          <div className="space-y-4">
            <div className="glass-card p-4 border-blue-500/10">
              <div className="metric-label text-white/40 text-xs uppercase">Overall Progress</div>
              <div className="metric-value text-blue-400 font-black text-3xl">{clientSummary?.timeline_progress ?? 0}%</div>
              <div className="mt-3 h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)] transition-all duration-1000" style={{ width: `${clientSummary?.timeline_progress ?? 0}%` }} />
              </div>
            </div>
            <div className="glass-card p-4 border-white/5">
              <div className="metric-label text-white/40 text-xs uppercase">Budget Spent</div>
              <div className="metric-value text-white font-black text-3xl">{clientSummary?.budget_spent_percent ?? 0}%</div>
              <div className="mt-3 h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-white/40 transition-all duration-1000" style={{ width: `${clientSummary?.budget_spent_percent ?? 0}%` }} />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="glass-card metric-card-premium border-blue-500/10">
            <div className="metric-label text-white/40">Overall Progress</div>
            <div className="metric-value text-blue-400 font-black">{clientSummary?.timeline_progress ?? 0}%</div>
            <div className="mt-3 h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)] transition-all duration-1000" style={{ width: `${clientSummary?.timeline_progress ?? 0}%` }} />
            </div>
          </div>
          <div className="glass-card metric-card-premium border-white/5">
            <div className="metric-label text-white/40">Budget Spent</div>
            <div className="metric-value text-white">{clientSummary?.budget_spent_percent ?? 0}%</div>
            <div className="mt-3 h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-white/40 transition-all duration-1000" style={{ width: `${clientSummary?.budget_spent_percent ?? 0}%` }} />
            </div>
          </div>
          <div className="glass-card metric-card-premium border-green-500/10">
            <div className="metric-label text-white/40">Deliverables</div>
            <div className="metric-value text-green-400 font-black">{clientSummary?.deliverables.length ?? 0}</div>
            <div className="text-[10px] text-white/20 font-bold uppercase tracking-widest mt-1">Contract Milestones</div>
          </div>
          <div className="glass-card metric-card-premium border-amber-500/10">
            <div className="metric-label text-white/40">Final Gallery</div>
            <div className="metric-value text-amber-400 font-black">{clientSummary?.gallery.length ?? 0}</div>
            <div className="text-[10px] text-white/20 font-bold uppercase tracking-widest mt-1">Approved Photos</div>
          </div>
        </div>
        )}
        
        {/* Deliverables */}
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
                      <div>
                        <div className="text-base font-bold text-white group-hover:text-blue-400 transition-colors tracking-tight">{d.title}</div>
                        <div className="text-xs text-white/40 font-medium">Due: {d.due_date}</div>
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
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
