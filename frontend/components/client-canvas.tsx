"use client";

import { MetricCard } from "./ui/metric-card";
import { EmptyState } from "./ui/empty-state";
import { ProgressBar } from "./ui/progress-bar";
import { EvidenceGallery } from "./evidence-gallery";
import { CheckCircle2, Clock3 } from "lucide-react";

type Deliverable = { id: string; task_id: string; title: string; due_date: string; status: string; client_visible: boolean };
type Evidence = { id: string; task_id: string; file_name: string; url_archivo: string; quality_score: number; status: string; ai_processing_status: string; is_visible_to_client: boolean; created_at?: string };
type ClientSummary = { project_name: string; timeline_progress: number; budget_spent_percent: number; deliverables: Deliverable[]; gallery: Evidence[] };

type ClientCanvasProps = {
  activeView: string;
  clientSummary: ClientSummary | null;
  selectedTaskId?: string | null;
  onDeliverableClick: (deliverableId: string, taskId?: string) => void;
  onClearTaskFilter?: () => void;
};

export function ClientCanvas({
  activeView,
  clientSummary,
  selectedTaskId,
  onDeliverableClick,
  onClearTaskFilter,
}: ClientCanvasProps) {
  const gallery = clientSummary?.gallery ?? [];
  const filteredGallery = selectedTaskId
    ? gallery.filter((evidence) => evidence.task_id === selectedTaskId)
    : gallery;

  if (activeView === "summary") {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="executive-header">
          <h1 className="text-4xl font-black text-white tracking-tight leading-none">
            {clientSummary?.project_name ?? "Project Summary"}
          </h1>
          <p className="mt-2 text-sm text-white/50 font-medium">
            Curated technical and financial view for tracking your project.
          </p>
        </div>

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
              {(clientSummary?.deliverables ?? []).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="glass-card p-5 flex items-center justify-between group hover:bg-white/10 transition-all border-white/5 active:scale-[0.99]"
                  onClick={() => onDeliverableClick(d.id, d.task_id)}
                  title="Open approved evidence for this deliverable"
                >
                  <div className="flex items-center gap-4">
                    <div className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-colors shadow-lg ${
                      d.status === "approved" ? "bg-green-500/10 text-green-400 shadow-green-500/5 group-hover:bg-green-500/20" : "bg-amber-500/10 text-amber-400 shadow-amber-500/5 group-hover:bg-amber-500/20"
                    }`}>
                      {d.status === "approved" ? <CheckCircle2 size={24} /> : <Clock3 size={24} />}
                    </div>
                    <div className="text-left">
                      <div className="text-base font-bold text-white group-hover:text-blue-400 transition-colors tracking-tight">{d.title}</div>
                      <div className="text-xs text-white/40 font-medium">Due: {d.due_date}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                      d.status === "approved" ? "bg-green-500/10 text-green-400 border-green-500/20 group-hover:bg-green-500" : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    }`}>
                      {d.status === "approved" ? "Approved ✓" : "In Progress"}
                    </span>
                  </div>
                </button>
              ))}
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
