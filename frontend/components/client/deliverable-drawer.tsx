"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  FileText,
  Image as ImageIcon,
  Sparkles,
  Star,
  ChevronDown,
} from "lucide-react";
import { withAccessToken } from "../../lib/files";
import { BeforeAfterSlider } from "./before-after-slider";
import { TaskChat } from "../ui/task-chat";
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
  ai_feedback?: unknown;
  uploader_name?: string;
  created_at?: string;
};

type Props = {
  deliverable: Deliverable | null;
  evidences: Evidence[];
  accessToken?: string;
  canAct: boolean;
  currentUserId?: string;
  onApprove?: (id: string, comment: string) => Promise<void>;
  onReject?: (id: string, reason: string, category: string) => Promise<void>;
  onEvidenceClick?: (taskId: string) => void;
};

const CATEGORY_OPTIONS: { value: string; label: string; suggestions: string[] }[] = [
  {
    value: "missing_photos",
    label: "Missing photos",
    suggestions: [
      "Need a photo from another angle",
      "Edge detail isn't visible",
      "Missing photos of the intermediate process",
    ],
  },
  {
    value: "wrong_phase",
    label: "Wrong phase",
    suggestions: [
      "This phase isn't complete yet",
      "Photos belong to a different phase",
      "Previous phase still pending",
    ],
  },
  {
    value: "quality_issue",
    label: "Quality issue",
    suggestions: [
      "Finish doesn't match what we agreed",
      "Visible cracks or imperfections",
      "Measurements don't match the plan",
    ],
  },
  {
    value: "scope_mismatch",
    label: "Out of scope",
    suggestions: [
      "Doesn't match the original scope",
      "Missing the agreed material",
      "Design differs from what was approved",
    ],
  },
  { value: "other", label: "Other", suggestions: [] },
];

const MAX_REASON = 2000;

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

function categoryLabel(value?: string): string {
  if (!value) return "";
  return CATEGORY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

type AIFeedbackShape = {
  analysis_summary?: string;
  detected_issues?: string[];
  recommendations?: string;
};

function parseAIFeedback(raw: unknown): AIFeedbackShape | null {
  if (!raw) return null;
  try {
    if (typeof raw === "string") return JSON.parse(raw) as AIFeedbackShape;
    return raw as AIFeedbackShape;
  } catch {
    return null;
  }
}

export function DeliverableDrawerContent({
  deliverable,
  evidences,
  accessToken,
  canAct,
  currentUserId,
  onApprove,
  onReject,
  onEvidenceClick,
}: Props) {
  const [pending, setPending] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveComment, setApproveComment] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState<string>("");

  const linkedEvidences = useMemo(
    () => (deliverable ? evidences.filter((e) => e.task_id === deliverable.task_id) : []),
    [evidences, deliverable],
  );

  if (!deliverable) return null;
  const badge = statusBadge(deliverable.status);
  const overdue = deliverable.status !== "approved" && new Date(deliverable.due_date).getTime() < Date.now();
  const selectedCategory = CATEGORY_OPTIONS.find((c) => c.value === category);

  async function doApprove() {
    if (!onApprove || !deliverable) return;
    setPending(true);
    try {
      await onApprove(deliverable.id, approveComment.trim());
      toast.success("Deliverable approved");
    } catch (e) {
      toast.error((e as Error).message || "Could not approve");
    } finally {
      setPending(false);
      setApproveOpen(false);
      setApproveComment("");
    }
  }

  async function doReject() {
    if (!onReject || !deliverable) return;
    setPending(true);
    try {
      await onReject(deliverable.id, reason.trim(), category);
      toast.success("Changes requested");
    } catch (e) {
      toast.error((e as Error).message || "Could not submit");
    } finally {
      setPending(false);
      setRejectOpen(false);
      setReason("");
      setCategory("");
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
          <div className="space-y-3">
            {deliverable.approved_at && (
              <div className="flex items-start gap-2 text-sm text-white/85">
                <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" style={{ color: "#10b981" }} />
                <div className="min-w-0">
                  <div>
                    <span className="font-semibold text-white">Approved</span>
                    {deliverable.approved_by_name && <span className="text-white/60"> by {deliverable.approved_by_name}</span>}
                  </div>
                  <div className="text-xs text-white/50">{fmtDateTime(deliverable.approved_at)}</div>
                  {deliverable.approval_comment && (
                    <div className="mt-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-2 text-xs text-white/80 whitespace-pre-wrap">
                      “{deliverable.approval_comment}”
                    </div>
                  )}
                </div>
              </div>
            )}
            {deliverable.rejection_reason && deliverable.status === "rejected" && (
              <div className="flex items-start gap-2 text-sm">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" style={{ color: "#ef4444" }} />
                <div className="min-w-0">
                  <div className="font-semibold text-white">Changes requested</div>
                  {deliverable.rejection_category && (
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      {categoryLabel(deliverable.rejection_category)}
                    </span>
                  )}
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
          <div className="space-y-4">
            {linkedEvidences.map((e) => (
              <EvidenceCard key={e.id} evidence={e} accessToken={accessToken} onClick={() => onEvidenceClick?.(deliverable.task_id)} />
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

      {/* Direct chat with project owner */}
      {accessToken && currentUserId && deliverable.task_id && (
        <Section icon={<FileText size={14} />} label="Chat">
          <TaskChat
            taskId={deliverable.task_id}
            accessToken={accessToken}
            currentUserId={currentUserId}
            selfRole="client"
          />
        </Section>
      )}

      {/* Actions */}
      {canAct && deliverable.status !== "approved" && (
        <div className="drawer-actions">
          <button
            type="button"
            className="drawer-action-approve"
            disabled={pending}
            onClick={() => setApproveOpen(true)}
          >
            <ThumbsUp size={14} /> Approve
          </button>
          <button
            type="button"
            className="drawer-action-reject"
            disabled={pending}
            onClick={() => setRejectOpen(true)}
          >
            <ThumbsDown size={14} /> Request changes
          </button>
        </div>
      )}

      {/* APPROVE MODAL — with optional comment */}
      {approveOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          onClick={(ev) => { if (ev.target === ev.currentTarget) { setApproveOpen(false); setApproveComment(""); } }}
        >
          <div className="glass-card border-white/10 p-6 max-w-md w-full">
            <h3 className="text-xl font-black text-white mb-2">Approve deliverable</h3>
            <p className="text-sm text-white/60 mb-4">
              The team will be notified. Add a short note if you want to share what you liked
              or what to keep in mind for next milestones.
            </p>
            <textarea
              value={approveComment}
              onChange={(ev) => setApproveComment(ev.target.value.slice(0, MAX_REASON))}
              placeholder="Optional comment (visible to the team)..."
              className="w-full rounded-xl bg-white/5 border border-white/10 p-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-500/40"
              rows={3}
              autoFocus
            />
            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-[10px] text-white/35 font-bold uppercase tracking-widest">
                {approveComment.length}/{MAX_REASON}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setApproveOpen(false); setApproveComment(""); }}
                  className="rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 text-sm text-white/70 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={doApprove}
                  className="rounded-xl px-4 py-2 text-sm font-bold text-white transition-all disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}
                >
                  Approve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REQUEST CHANGES MODAL */}
      {rejectOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          onClick={(ev) => { if (ev.target === ev.currentTarget) { setRejectOpen(false); setReason(""); setCategory(""); } }}
        >
          <div className="glass-card border-white/10 p-6 max-w-lg w-full">
            <h3 className="text-xl font-black text-white mb-2">Request changes</h3>
            <p className="text-sm text-white/60 mb-4">
              Tell the team what needs to change. The owner will see this reason and can re-submit
              once the issue is resolved.
            </p>

            <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1 block">
              Category
            </label>
            <select
              value={category}
              onChange={(ev) => setCategory(ev.target.value)}
              className="w-full rounded-xl bg-white/5 border border-white/10 p-3 text-sm text-white focus:outline-none focus:border-amber-500/40 mb-3"
            >
              <option value="">Choose a category…</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>

            {selectedCategory && selectedCategory.suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {selectedCategory.suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setReason((prev) => (prev ? prev + "\n" + s : s).slice(0, MAX_REASON))}
                    className="rounded-full bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 text-xs text-white/70 transition-all"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            )}

            <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1 block">
              What needs to change
            </label>
            <textarea
              value={reason}
              onChange={(ev) => setReason(ev.target.value.slice(0, MAX_REASON))}
              placeholder="Example: Missing a photo of the north end of the beam..."
              className="w-full rounded-xl bg-white/5 border border-white/10 p-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-500/40"
              rows={4}
              autoFocus
            />

            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-[10px] text-white/35 font-bold uppercase tracking-widest">
                {reason.length}/{MAX_REASON}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setRejectOpen(false); setReason(""); setCategory(""); }}
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
        </div>
      )}
    </div>
  );
}

function EvidenceCard({ evidence, accessToken, onClick }: { evidence: Evidence; accessToken?: string; onClick?: () => void }) {
  const [aiOpen, setAiOpen] = useState(false);
  const ai = parseAIFeedback(evidence.ai_feedback);
  const hasReference = !!evidence.reference_photo_url;
  const afterUrl = withAccessToken(evidence.url_archivo, accessToken);
  const beforeUrl = hasReference ? withAccessToken(evidence.reference_photo_url!, accessToken) : "";

  return (
    <div className="evidence-card">
      <div className="evidence-card-media">
        {hasReference ? (
          <BeforeAfterSlider
            beforeUrl={beforeUrl}
            afterUrl={afterUrl}
            beforeAlt="Reference"
            afterAlt={evidence.file_name}
          />
        ) : (
          <button type="button" className="evidence-card-image" onClick={onClick} title={evidence.file_name}>
            <img
              src={afterUrl}
              alt={evidence.file_name}
              onError={(ev) => ((ev.currentTarget as HTMLImageElement).style.display = "none")}
            />
          </button>
        )}
        {evidence.quality_score > 0 && (
          <div className="evidence-card-score">
            <Star size={11} /> {evidence.quality_score}
          </div>
        )}
      </div>
      <div className="evidence-card-meta">
        <span className="evidence-card-name" title={evidence.file_name}>{evidence.file_name}</span>
        {evidence.uploader_name && (
          <span className="evidence-card-uploader">by {evidence.uploader_name}</span>
        )}
      </div>
      {ai && (ai.analysis_summary || (ai.detected_issues && ai.detected_issues.length > 0)) && (
        <div className={`evidence-card-ai ${aiOpen ? "open" : ""}`}>
          <button
            type="button"
            className="evidence-card-ai-toggle"
            onClick={() => setAiOpen((v) => !v)}
          >
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
                    {ai.detected_issues.map((it, i) => (
                      <li key={i}>{it}</li>
                    ))}
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
