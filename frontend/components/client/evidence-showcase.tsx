"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ImageOff } from "lucide-react";
import { withAccessToken } from "../../lib/files";
import { BeforeAfterSlider } from "./before-after-slider";

type Deliverable = {
  id: string;
  task_id: string;
  title: string;
  status: string;
};

type Evidence = {
  id: string;
  task_id: string;
  file_name: string;
  url_archivo: string;
  reference_photo_url?: string;
  quality_score: number;
  created_at?: string;
};

type Props = {
  deliverables: Deliverable[];
  evidences: Evidence[];
  accessToken?: string;
  onEvidenceClick?: (taskId: string) => void;
};

type Group = {
  key: string;
  taskId: string;
  title: string;
  status: string;
  evidences: Evidence[];
};

export function EvidenceShowcase({ deliverables, evidences, accessToken, onEvidenceClick }: Props) {
  const groups = useMemo<Group[]>(() => {
    const byTaskID = new Map<string, Group>();
    // Seed with deliverables first (for stable order) — only those with evidence will render.
    for (const d of deliverables) {
      if (!byTaskID.has(d.task_id)) {
        byTaskID.set(d.task_id, { key: d.id, taskId: d.task_id, title: d.title, status: d.status, evidences: [] });
      }
    }
    for (const e of evidences) {
      const g = byTaskID.get(e.task_id);
      if (g) g.evidences.push(e);
      else byTaskID.set(e.task_id, { key: e.task_id, taskId: e.task_id, title: "Other", status: "pending", evidences: [e] });
    }
    return Array.from(byTaskID.values()).filter((g) => g.evidences.length > 0);
  }, [deliverables, evidences]);

  if (groups.length === 0) {
    return (
      <div className="evidence-showcase-empty">
        <ImageOff size={32} className="mx-auto mb-3 text-white/30" />
        <p className="text-sm text-white/50">There is no approved evidence to display yet.</p>
      </div>
    );
  }

  return (
    <div className="evidence-showcase">
      {groups.map((g) => (
        <ShowcaseGroup key={g.key} group={g} accessToken={accessToken} onEvidenceClick={onEvidenceClick} />
      ))}
    </div>
  );
}

function ShowcaseGroup({ group, accessToken, onEvidenceClick }: { group: Group; accessToken?: string; onEvidenceClick?: (taskId: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  const visible = expanded ? group.evidences : group.evidences.slice(0, 3);
  const featured = group.evidences[0];
  const hasFeaturedSlider = featured && featured.reference_photo_url;

  return (
    <section className="showcase-group">
      <header className="showcase-group-header">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="showcase-group-title">{group.title}</h3>
            {group.status === "approved" && (
              <span className="showcase-group-badge">
                <CheckCircle2 size={12} /> Approved
              </span>
            )}
          </div>
          <span className="showcase-group-count">{group.evidences.length} {group.evidences.length === 1 ? "photo" : "photos"}</span>
        </div>
        {group.evidences.length > 3 && (
          <button
            type="button"
            className="showcase-group-toggle"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Collapse" : `Show all ${group.evidences.length}`}
            <ChevronDown size={14} className={`transition ${expanded ? "rotate-180" : ""}`} />
          </button>
        )}
      </header>

      {hasFeaturedSlider && (
        <div className="showcase-featured">
          <BeforeAfterSlider
            beforeUrl={withAccessToken(featured.reference_photo_url!, accessToken)}
            afterUrl={withAccessToken(featured.url_archivo, accessToken)}
            beforeAlt="Reference"
            afterAlt={featured.file_name}
          />
        </div>
      )}

      <div className="showcase-grid">
        {visible.slice(hasFeaturedSlider ? 1 : 0).map((e) => (
          <button
            key={e.id}
            type="button"
            className="showcase-thumb"
            onClick={() => onEvidenceClick?.(group.taskId)}
            title={e.file_name}
          >
            <img
              src={withAccessToken(e.url_archivo, accessToken)}
              alt={e.file_name}
              onError={(ev) => ((ev.currentTarget as HTMLImageElement).style.display = "none")}
            />
            {e.quality_score > 0 && (
              <span className="showcase-thumb-score">{e.quality_score}</span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
