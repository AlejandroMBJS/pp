"use client";

import { useState } from "react";
import { toast } from "sonner";

type Deliverable = {
  id: string;
  title: string;
  task_title?: string;
  rejection_reason?: string;
  rejection_category?: string;
};

type Props = {
  deliverable: Deliverable | null;
  onClose: () => void;
  onSubmit: (id: string, note: string) => Promise<void>;
};

const MAX_NOTE = 2000;

export function ResubmitDeliverableModal({ deliverable, onClose, onSubmit }: Props) {
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  if (!deliverable) return null;

  async function go() {
    if (!deliverable) return;
    setPending(true);
    try {
      await onSubmit(deliverable.id, note.trim());
      toast.success("Sent for review");
      onClose();
    } catch (e) {
      toast.error((e as Error).message || "Could not resubmit");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-card border-white/10 p-6 max-w-lg w-full">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40 mb-1">
          Send back for review
        </div>
        <h3 className="text-xl font-black text-white">{deliverable.title}</h3>
        {deliverable.task_title && (
          <div className="text-xs text-white/45 mt-0.5">{deliverable.task_title}</div>
        )}

        {deliverable.rejection_reason && (
          <div className="mt-4 rounded-xl border px-3 py-2.5 text-xs" style={{ background: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.25)", color: "#f59e0b" }}>
            <div className="font-bold inline-flex items-center gap-1">↺ Original feedback</div>
            <div className="text-white/80 mt-1 whitespace-pre-wrap">{deliverable.rejection_reason}</div>
            {deliverable.rejection_category && (
              <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest" style={{ background: "rgba(245,158,11,0.18)" }}>
                {deliverable.rejection_category.replace(/_/g, " ")}
              </span>
            )}
          </div>
        )}

        <label className="text-[10px] font-bold uppercase tracking-widest text-white/45 mt-5 mb-1 block">
          What did you change? (optional)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
          placeholder="e.g. Added the missing photos from the north end, fixed the alignment shown in the second image."
          className="w-full rounded-xl bg-white/5 border border-white/10 p-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-500/40"
          rows={4}
          autoFocus
        />

        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-[10px] text-white/35 font-bold uppercase tracking-widest">{note.length}/{MAX_NOTE}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 text-sm text-white/70 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={go}
              className="rounded-xl px-4 py-2 text-sm font-bold text-white transition disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}
            >
              ↻ Send for review
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
