"use client";

import { useState } from "react";
import { CheckCircle2, Clock3, AlertCircle, ThumbsUp, ThumbsDown, FileText, Image as ImageIcon } from "lucide-react";
import { withAccessToken } from "../../lib/files";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { toast } from "sonner";

type Deliverable = {
  id: string;
  task_id: string;
  title: string;
  description?: string;
  due_date: string;
  status: string;
  approved_by_name?: string;
  approved_at?: string;
  rejection_reason?: string;
  task_title?: string;
};

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
  deliverable: Deliverable | null;
  evidences: Evidence[];
  accessToken?: string;
  canAct: boolean;
  onApprove?: (id: string) => Promise<void>;
  onReject?: (id: string, reason: string) => Promise<void>;
  onEvidenceClick?: (taskId: string) => void;
};

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusBadge(status: string) {
  if (status === "approved") return { label: "Approved", color: "#10b981", bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.3)" };
  if (status === "rejected") return { label: "Changes requested", color: "#ef4444", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)" };
  return { label: "Pending your review", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)" };
}

export function DeliverableDrawerContent({
  deliverable,
  evidences,
  accessToken,
  canAct,
  onApprove,
  onReject,
  onEvidenceClick,
}: Props) {
  const [pending, setPending] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  if (!deliverable) return null;
  const badge = statusBadge(deliverable.status);
  const overdue = deliverable.status !== "approved" && new Date(deliverable.due_date).getTime() < Date.now();
  const linkedEvidences = evidences.filter((e) => e.task_id === deliverable.task_id);

  async function doApprove() {
    if (!onApprove || !deliverable) return;
    setPending(true);
    try {
      await onApprove(deliverable.id);
      toast.success("Deliverable approved");
    } catch (e) {
      toast.error((e as Error).message || "Could not approve");
    } finally {
      setPending(false);
      setConfirmApprove(false);
    }
  }

  async function doReject() {
    if (!onReject || !deliverable) return;
    setPending(true);
    try {
      await onReject(deliverable.id, reason);
      toast.success("Changes requested");
    } catch (e) {
      toast.error((e as Error).message || "Could not submit");
    } finally {
      setPending(false);
      setRejecting(false);
      setReason("");
    }
  }

  return (
    <div className="space-y-6">
      {/* Status banner */}
      <div
        className="drawer-status-banner"
        style={{ background: badge.bg, borderColor: badge.border, color: badge.color }}
      >
        {deliverable.status === "approved" ? <CheckCircle2 size={16} /> : overdue ? <AlertCircle size={16} /> : <Clock3 size={16} />}
        <span className="font-bold">{badge.label}</span>
        <span className="opacity-60">·</span>
        <span>Due {fmtDate(deliverable.due_date)}</span>
        {overdue && <span className="ml-auto text-[11px] uppercase tracking-widest">Overdue</span>}
      </div>

      {/* Description */}
      <Section icon={<FileText size={14} />} label="Description">
        {deliverable.description ? (
          <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{deliverable.description}</p>
        ) : (
          <p className="text-sm text-white/40 italic">No description provided.</p>
        )}
        {deliverable.task_title && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-white/60">
            <span className="text-white/35 uppercase tracking-widest text-[10px] font-bold">Linked task</span>
            <span className="text-white/80">{deliverable.task_title}</span>
          </div>
        )}
      </Section>

      {/* Approval history */}
      {(deliverable.approved_at || deliverable.rejection_reason) && (
        <Section icon={<Clock3 size={14} />} label="History">
          <div className="space-y-2">
            {deliverable.approved_at && (
              <div className="flex items-start gap-2 text-sm text-white/80">
                <CheckCircle2 size={14} className="mt-0.5" style={{ color: "#10b981" }} />
                <div>
                  <div>
                    <span className="font-semibold text-white">Approved</span>
                    {deliverable.approved_by_name && <span className="text-white/60"> by {deliverable.approved_by_name}</span>}
                  </div>
                  <div className="text-xs text-white/50">{fmtDateTime(deliverable.approved_at)}</div>
                </div>
              </div>
            )}
            {deliverable.rejection_reason && deliverable.status === "rejected" && (
              <div className="flex items-start gap-2 text-sm">
                <AlertCircle size={14} className="mt-0.5" style={{ color: "#ef4444" }} />
                <div>
                  <div className="font-semibold text-white">Changes requested</div>
                  <div className="text-xs text-white/70 mt-1 whitespace-pre-wrap">{deliverable.rejection_reason}</div>
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Evidence */}
      <Section icon={<ImageIcon size={14} />} label={`Evidence (${linkedEvidences.length})`}>
        {linkedEvidences.length === 0 ? (
          <p className="text-sm text-white/40 italic">No evidence uploaded yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {linkedEvidences.map((e) => (
              <button
                key={e.id}
                type="button"
                className="drawer-evidence-thumb"
                onClick={() => onEvidenceClick?.(deliverable.task_id)}
                title={e.file_name}
              >
                <img
                  src={withAccessToken(e.url_archivo, accessToken)}
                  alt={e.file_name}
                  onError={(ev) => {
                    (ev.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
                {e.quality_score > 0 && (
                  <span className="drawer-evidence-score">{e.quality_score}</span>
                )}
              </button>
            ))}
          </div>
        )}
        {linkedEvidences.length > 0 && (
          <button
            type="button"
            className="mt-3 text-xs font-bold uppercase tracking-widest text-white/50 hover:text-white/80 transition"
            onClick={() => onEvidenceClick?.(deliverable.task_id)}
          >
            See all in gallery →
          </button>
        )}
      </Section>

      {/* Actions (only when can act and not yet approved) */}
      {canAct && deliverable.status !== "approved" && (
        <div className="drawer-actions">
          <button
            type="button"
            className="drawer-action-approve"
            disabled={pending}
            onClick={() => setConfirmApprove(true)}
          >
            <ThumbsUp size={14} /> Approve
          </button>
          <button
            type="button"
            className="drawer-action-reject"
            disabled={pending}
            onClick={() => setRejecting(true)}
          >
            <ThumbsDown size={14} /> Request changes
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmApprove}
        title="Approve deliverable?"
        body="Once approved, the deliverable will be marked as completed and the project owner will be notified."
        confirmLabel="Approve"
        onConfirm={doApprove}
        onCancel={() => setConfirmApprove(false)}
      />

      {rejecting && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) { setRejecting(false); setReason(""); } }}
        >
          <div className="glass-card border-white/10 p-6 max-w-md w-full">
            <h3 className="text-xl font-black text-white mb-2">Request changes</h3>
            <p className="text-sm text-white/60 mb-4">Tell the team what needs to change. The owner will see this reason.</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for requesting changes..."
              className="w-full rounded-xl bg-white/5 border border-white/10 p-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-500/40"
              rows={4}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setRejecting(false); setReason(""); }}
                className="rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 text-sm text-white/70 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!reason.trim() || pending}
                onClick={doReject}
                className="rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2 text-sm font-bold text-white transition-all disabled:opacity-40"
              >
                Submit request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="drawer-section-label">
        <span className="drawer-section-icon">{icon}</span>
        {label}
      </div>
      <div className="drawer-section-body">{children}</div>
    </div>
  );
}
