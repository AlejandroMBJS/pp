"use client";

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  Cloud,
  CloudSun,
  FileDown,
  History,
  ImagePlus,
  Pencil,
  Plus,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "./ui/confirm-dialog";
import { Toolbar, SearchInput, DateRangeInputs } from "./ui/toolbar";

type DailyLogPhoto = {
  id: string;
  log_id: string;
  url: string;
  caption: string;
  section: string;
  uploaded_by_user_id: string;
  created_at: string;
};

type DailyLog = {
  id: string;
  project_id: string;
  date: string;
  log_date: string;
  narrative: string;
  weather?: string;
  headcount?: number;
  manpower_json?: string;
  accidents?: string;
  sections: Record<string, unknown>;
  status: "draft" | "submitted" | "approved" | "rejected" | string;
  author_user_id: string;
  submitted_at?: string | null;
  approved_by_user_id?: string;
  approved_at?: string | null;
  reviewer_comment?: string;
  photos: DailyLogPhoto[] | null;
  preset: string;
  created_at: string;
  updated_at?: string | null;
};

type Preset = {
  key: string;
  label: string;
  sections: string[];
  requires_signature: boolean;
  includes_weather: boolean;
};

type Project = {
  id: string;
  name: string;
  latitude_center?: number;
  longitude_center?: number;
  daily_log_preset?: string;
};

type Session = {
  access_token: string;
  user: { id: string; role: string; tenant_id?: string };
};

type WeatherPayload = {
  summary?: string;
  temp_c?: number;
  wind_kph?: number;
  precipitation_mm?: number;
  source?: string;
  fetched_at?: string;
};

type CrewEntry = { trade: string; count: number };

const EMPTY_SECTIONS: Record<string, unknown> = {};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function statusBadge(status: string) {
  switch (status) {
    case "draft":
      return { label: "Draft", className: "bg-white/10 text-white/70 border-white/10" };
    case "submitted":
      return { label: "Pending approval", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" };
    case "approved":
      return { label: "Approved", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" };
    case "rejected":
      return { label: "Rejected", className: "bg-red-500/15 text-red-300 border-red-500/30" };
    default:
      return { label: status, className: "bg-white/5 text-white/40 border-white/10" };
  }
}

function sectionLabel(key: string): string {
  const map: Record<string, string> = {
    weather: "Weather",
    crew: "Crew on site",
    deliveries: "Deliveries",
    safety: "Safety / incidents",
    equipment: "Equipment",
    issues: "Issues / blockers",
    shift: "Shift handover",
    production: "Production output",
    downtime: "Downtime",
    quality: "Quality / QC",
    job_info: "Job information",
    parts_used: "Parts used",
    customer_signature: "Customer signature",
    asset: "Asset / unit",
    meters: "Meter readings",
    parts: "Parts",
    followup: "Follow-up",
  };
  return map[key] || key.replace(/_/g, " ");
}

function coerceWeather(raw: unknown): WeatherPayload {
  if (!raw || typeof raw !== "object") return {};
  const w = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  return {
    summary: typeof w.summary === "string" ? w.summary : undefined,
    temp_c: num(w.temp_c),
    wind_kph: num(w.wind_kph),
    precipitation_mm: num(w.precipitation_mm),
    source: typeof w.source === "string" ? w.source : undefined,
    fetched_at: typeof w.fetched_at === "string" ? w.fetched_at : undefined,
  };
}

function coerceCrew(raw: unknown): CrewEntry[] {
  if (!Array.isArray(raw)) {
    if (raw && typeof raw === "object") {
      return Object.entries(raw as Record<string, unknown>).map(([trade, count]) => ({
        trade,
        count: Number(count) || 0,
      }));
    }
    return [];
  }
  return raw
    .map((v) => {
      if (!v || typeof v !== "object") return null;
      const r = v as Record<string, unknown>;
      return { trade: String(r.trade ?? ""), count: Number(r.count ?? 0) || 0 };
    })
    .filter((x): x is CrewEntry => !!x && !!x.trade);
}

function coerceText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw == null) return "";
  return JSON.stringify(raw);
}

export function DailyJournal({ project, session }: { project: Project; session: Session }) {
  const role = session?.user?.role ?? "helper";
  const myUserId = session?.user?.id ?? "";
  const canReview = role === "owner" || role === "supervisor";

  const [presets, setPresets] = useState<Preset[]>([]);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftSections, setDraftSections] = useState<Record<string, unknown>>(EMPTY_SECTIONS);
  const [draftNarrative, setDraftNarrative] = useState("");
  const [draftDate, setDraftDate] = useState(todayISO());

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reviewerComment, setReviewerComment] = useState("");

  const [logSearch, setLogSearch] = useState("");
  const [logFrom, setLogFrom] = useState("");
  const [logTo, setLogTo] = useState("");

  const [savingBusy, setSavingBusy] = useState(false);

  const token = session?.access_token ?? "";

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }),
    [token]
  );

  const currentPreset: Preset = useMemo(() => {
    const selected = selectedLogId ? logs.find((l) => l.id === selectedLogId) : undefined;
    const key = selected?.preset || project.daily_log_preset || "generic";
    return presets.find((p) => p.key === key) || { key: "generic", label: "Generic", sections: [], requires_signature: false, includes_weather: false };
  }, [presets, project.daily_log_preset, logs, selectedLogId]);

  // All fetches below use authHeaders / token from closure. Both authHeaders
  // (useMemo) and fetchLogs (useCallback) include `token` in their deps, so a
  // session refresh flushes the cached references and the next call uses the
  // new token. In-flight requests that started with a stale token will hit
  // 401 and surface as "Could not load…" — acceptable until F2 (refresh flow)
  // lands. See audit-findings.md F5.
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/projects/${project.id}/daily-logs`, {
        headers: authHeaders,
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      const arr: DailyLog[] = Array.isArray(data) ? data : [];
      arr.sort((a, b) => (b.log_date || b.date || "").localeCompare(a.log_date || a.date || ""));
      setLogs(arr);
    } catch (error) {
      console.error(error);
      toast.error("Could not load the daily log.");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [project.id, authHeaders]);

  useEffect(() => {
    fetch("/api/v1/daily-log-presets", { headers: authHeaders })
      .then((r) => r.json())
      .then((p) => Array.isArray(p) && setPresets(p))
      .catch(() => {});
  }, [authHeaders]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const selectedLog = selectedLogId ? logs.find((l) => l.id === selectedLogId) || null : null;

  useEffect(() => {
    if (selectedLog && !editing) {
      setDraftSections(selectedLog.sections || {});
      setDraftNarrative(selectedLog.narrative || "");
      setDraftDate(selectedLog.log_date || selectedLog.date || todayISO());
    }
  }, [selectedLog, editing]);

  function startNewDraft() {
    setSelectedLogId(null);
    setEditing(true);
    setDraftSections({});
    setDraftNarrative("");
    setDraftDate(todayISO());
  }

  function startEdit(log: DailyLog) {
    setSelectedLogId(log.id);
    setEditing(true);
    setDraftSections(log.sections || {});
    setDraftNarrative(log.narrative || "");
    setDraftDate(log.log_date || log.date || todayISO());
  }

  function cancelEdit() {
    setEditing(false);
    if (!selectedLogId) {
      // cancelling a new draft
      setDraftSections({});
      setDraftNarrative("");
    }
  }

  function canEditLog(log: DailyLog): boolean {
    if (canReview) return true;
    if (log.author_user_id !== myUserId) return false;
    return log.status === "draft" || log.status === "rejected";
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftDate || !draftNarrative.trim()) {
      toast.error("Date and narrative are required.");
      return;
    }
    setSavingBusy(true);
    try {
      if (selectedLogId) {
        const res = await fetch(`/api/v1/daily-logs/${selectedLogId}`, {
          method: "PATCH",
          headers: authHeaders,
          body: JSON.stringify({
            log_date: draftDate,
            narrative: draftNarrative.trim(),
            sections: draftSections,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);
        toast.success("Daily log updated.");
      } else {
        const res = await fetch(`/api/v1/projects/${project.id}/daily-logs`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            log_date: draftDate,
            narrative: draftNarrative.trim(),
            sections: draftSections,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);
        toast.success("Daily log saved as draft.");
        if (payload?.id) setSelectedLogId(payload.id);
      }
      setEditing(false);
      await fetchLogs();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not save the daily log.");
    } finally {
      setSavingBusy(false);
    }
  }

  async function handleDelete(logId: string) {
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`/api/v1/daily-logs/${logId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);
      toast.success("Daily log deleted.");
      if (selectedLogId === logId) setSelectedLogId(null);
      await fetchLogs();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not delete the daily log.");
    }
  }

  async function handleTransition(logId: string, action: "submit" | "approve" | "reject", comment?: string) {
    try {
      const res = await fetch(`/api/v1/daily-logs/${logId}/${action}`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(action === "reject" ? { comment: comment || "" } : {}),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);
      const msg = action === "submit" ? "Submitted for approval." : action === "approve" ? "Daily log approved." : "Daily log rejected.";
      toast.success(msg);
      await fetchLogs();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Action failed.");
    }
  }

  async function handlePhotoUpload(logId: string, file: File) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      toast.error("Only image files are supported.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Photo must be under 10 MB.");
      return;
    }
    const toastId = toast.loading("Uploading photo…");
    try {
      const r1 = await fetch(`/api/v1/daily-logs/${logId}/photos/upload-url`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          file_name: file.name,
          content_type: file.type || "image/jpeg",
          intended_size_bytes: file.size,
        }),
      });
      const sess = await r1.json().catch(() => ({}));
      if (!r1.ok) throw new Error(sess?.error ?? `HTTP ${r1.status}`);
      const uploadURL: string = sess.upload_url || "";
      if (!uploadURL) throw new Error("Missing upload URL.");
      const r2 = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      if (!r2.ok) throw new Error(`Upload failed: HTTP ${r2.status}`);
      const r3 = await fetch(`/api/v1/daily-logs/${logId}/photos/confirm`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ upload_session_id: sess.id, section: "", caption: "" }),
      });
      const confirmed = await r3.json().catch(() => ({}));
      if (!r3.ok) throw new Error(confirmed?.error ?? `HTTP ${r3.status}`);
      toast.dismiss(toastId);
      toast.success("Photo attached.");
      await fetchLogs();
    } catch (error) {
      toast.dismiss(toastId);
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    }
  }

  async function handlePhotoDelete(photoID: string) {
    try {
      const res = await fetch(`/api/v1/daily-logs/photos/${photoID}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error ?? `HTTP ${res.status}`);
      }
      toast.success("Photo removed.");
      await fetchLogs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete photo.");
    }
  }

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return logs.filter((log) => {
      const d = log.log_date || log.date || "";
      if (logFrom && d < logFrom) return false;
      if (logTo && d > logTo) return false;
      if (q) {
        const hay = `${log.narrative} ${JSON.stringify(log.sections || {})} ${log.reviewer_comment || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, logSearch, logFrom, logTo]);

  const pending = useMemo(() => filteredLogs.filter((l) => l.status === "submitted"), [filteredLogs]);
  const approved = useMemo(() => filteredLogs.filter((l) => l.status === "approved"), [filteredLogs]);
  const myDrafts = useMemo(
    () => filteredLogs.filter((l) => l.status === "draft" && l.author_user_id === myUserId),
    [filteredLogs, myUserId]
  );
  const rejected = useMemo(() => filteredLogs.filter((l) => l.status === "rejected"), [filteredLogs]);
  const otherDrafts = useMemo(
    () => canReview ? filteredLogs.filter((l) => l.status === "draft" && l.author_user_id !== myUserId) : [],
    [filteredLogs, canReview, myUserId]
  );

  // ── Detail/editor view ─────────────────────────────────────────────────────
  if (editing || selectedLogId) {
    return (
      <DetailView
        log={selectedLog}
        project={project}
        preset={currentPreset}
        editing={editing}
        canEdit={selectedLog ? canEditLog(selectedLog) : true}
        canReview={canReview}
        myUserId={myUserId}
        draftDate={draftDate}
        draftNarrative={draftNarrative}
        draftSections={draftSections}
        setDraftDate={setDraftDate}
        setDraftNarrative={setDraftNarrative}
        setDraftSections={setDraftSections}
        savingBusy={savingBusy}
        rejectingId={rejectingId}
        reviewerComment={reviewerComment}
        setRejectingId={setRejectingId}
        setReviewerComment={setReviewerComment}
        onBack={() => { setSelectedLogId(null); setEditing(false); }}
        onSave={handleSave}
        onCancel={cancelEdit}
        onEdit={() => selectedLog && startEdit(selectedLog)}
        onDelete={(id) => setConfirmDeleteId(id)}
        onTransition={handleTransition}
        onPhotoUpload={handlePhotoUpload}
        onPhotoDelete={handlePhotoDelete}
      />
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete daily log?"
        body="This will permanently remove the entry and all attached photos."
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirmDeleteId && void handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">Daily Log</h2>
          <p className="text-xs font-bold uppercase tracking-widest text-white/30 mt-1">
            {currentPreset.label} · {logs.length} entries
          </p>
        </div>
        <button
          onClick={startNewDraft}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-[0.2em] transition-all shadow-lg shadow-blue-900/40 active:scale-95"
        >
          <Plus size={16} /> Add entry
        </button>
      </div>

      {logs.length > 0 && (
        <Toolbar>
          <SearchInput value={logSearch} onChange={setLogSearch} placeholder="Search narrative, sections…" />
          <DateRangeInputs from={logFrom} to={logTo} onFromChange={setLogFrom} onToChange={setLogTo} />
        </Toolbar>
      )}

      <div className="space-y-8">
        {canReview && pending.length > 0 && (
          <LogGroup title="Pending approval" accent="amber" logs={pending} onSelect={setSelectedLogId} />
        )}
        {myDrafts.length > 0 && <LogGroup title={canReview ? "My drafts" : "My drafts"} accent="slate" logs={myDrafts} onSelect={setSelectedLogId} />}
        {canReview && otherDrafts.length > 0 && (
          <LogGroup title="Other drafts" accent="slate" logs={otherDrafts} onSelect={setSelectedLogId} />
        )}
        {rejected.length > 0 && <LogGroup title="Rejected" accent="red" logs={rejected} onSelect={setSelectedLogId} />}
        {approved.length > 0 && <LogGroup title="Approved" accent="emerald" logs={approved} onSelect={setSelectedLogId} />}

        {!loading && logs.length === 0 && (
          <div className="py-24 text-center glass-card border-dashed border-white/10">
            <History className="mx-auto text-white/10 mb-4" size={48} />
            <div className="text-sm font-bold text-white/20 uppercase tracking-[0.2em]">No log history yet</div>
            <p className="text-xs text-white/40 mt-3">Click &quot;Add entry&quot; to capture today&apos;s work.</p>
          </div>
        )}
        {!loading && logs.length > 0 && filteredLogs.length === 0 && (
          <div className="py-12 text-center glass-card border-dashed border-white/10">
            <div className="text-sm font-bold text-white/30 uppercase tracking-[0.2em]">No entries match the filters</div>
            <button
              type="button"
              onClick={() => { setLogSearch(""); setLogFrom(""); setLogTo(""); }}
              className="mt-3 text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── List group ───────────────────────────────────────────────────────────────
function LogGroup({
  title,
  logs,
  onSelect,
  accent,
}: {
  title: string;
  logs: DailyLog[];
  onSelect: (id: string) => void;
  accent: "amber" | "emerald" | "slate" | "red";
}) {
  const dot =
    accent === "amber" ? "bg-amber-400" :
    accent === "emerald" ? "bg-emerald-400" :
    accent === "red" ? "bg-red-400" : "bg-white/30";
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/50">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {title} ({logs.length})
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {logs.map((log) => (
          <LogCard key={log.id} log={log} onClick={() => onSelect(log.id)} />
        ))}
      </div>
    </section>
  );
}

function LogCard({ log, onClick }: { log: DailyLog; onClick: () => void }) {
  const badge = statusBadge(log.status);
  const photoCount = (log.photos || []).length;
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left glass-card p-4 border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-colors group"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{fmtDate(log.log_date || log.date)}</span>
        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${badge.className}`}>
          {badge.label}
        </span>
      </div>
      <p className="text-sm text-white/70 line-clamp-2 leading-relaxed">{log.narrative || <span className="text-white/30">(no narrative)</span>}</p>
      <div className="mt-3 flex items-center gap-3 text-[10px] font-bold text-white/30 uppercase tracking-widest">
        {photoCount > 0 && (
          <span className="flex items-center gap-1"><ImagePlus size={12} /> {photoCount}</span>
        )}
        {log.reviewer_comment && <span className="text-amber-400/70">has reviewer note</span>}
      </div>
    </button>
  );
}

// ── Detail / editor ──────────────────────────────────────────────────────────
function DetailView(props: {
  log: DailyLog | null;
  project: Project;
  preset: Preset;
  editing: boolean;
  canEdit: boolean;
  canReview: boolean;
  myUserId: string;
  draftDate: string;
  draftNarrative: string;
  draftSections: Record<string, unknown>;
  setDraftDate: (v: string) => void;
  setDraftNarrative: (v: string) => void;
  setDraftSections: (v: Record<string, unknown>) => void;
  savingBusy: boolean;
  rejectingId: string | null;
  reviewerComment: string;
  setRejectingId: (v: string | null) => void;
  setReviewerComment: (v: string) => void;
  onBack: () => void;
  onSave: (e: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onTransition: (id: string, action: "submit" | "approve" | "reject", comment?: string) => Promise<void>;
  onPhotoUpload: (logId: string, file: File) => Promise<void>;
  onPhotoDelete: (photoId: string) => Promise<void>;
}) {
  const {
    log, project, preset, editing, canEdit, canReview,
    draftDate, draftNarrative, draftSections,
    setDraftDate, setDraftNarrative, setDraftSections,
    savingBusy, rejectingId, reviewerComment,
    setRejectingId, setReviewerComment,
    onBack, onSave, onCancel, onEdit, onDelete, onTransition, onPhotoUpload, onPhotoDelete,
  } = props;

  const badge = log ? statusBadge(log.status) : null;
  const photos: DailyLogPhoto[] = log?.photos || [];

  const updateSection = (key: string, value: unknown) => {
    setDraftSections({ ...draftSections, [key]: value });
  };

  const sections = preset.sections.length ? preset.sections : ["narrative_only"];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white"
        >
          <ChevronLeft size={14} /> Back
        </button>
        <div className="flex items-center gap-2">
          {log && badge && (
            <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${badge.className}`}>
              {badge.label}
            </span>
          )}
          {log && !editing && canEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-white/70 border border-white/10"
            >
              <Pencil size={12} /> Edit
            </button>
          )}
          {log && !editing && canReview && (
            <button
              type="button"
              onClick={() => onDelete(log.id)}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-[10px] font-black uppercase tracking-widest text-red-300 border border-red-500/20"
            >
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
      </div>

      {log?.reviewer_comment && log.status === "rejected" && (
        <div className="glass-card p-4 border-red-500/20 bg-red-500/5">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle size={14} className="text-red-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-red-400">Reviewer comment</span>
          </div>
          <p className="text-sm text-red-200/80 leading-relaxed">{log.reviewer_comment}</p>
        </div>
      )}

      <form onSubmit={editing ? onSave : (e) => e.preventDefault()} className="space-y-6">
        <div className="glass-card p-5 border-white/5 bg-white/[0.02] space-y-5">
          <div className="flex flex-col md:flex-row gap-4">
            <label className="space-y-2 md:w-48">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Date</span>
              <input
                type="date"
                value={draftDate}
                disabled={!editing}
                onChange={(e) => setDraftDate(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-blue-500/40 disabled:opacity-60"
              />
            </label>
            <label className="space-y-2 flex-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Narrative</span>
              <textarea
                rows={4}
                value={draftNarrative}
                disabled={!editing}
                onChange={(e) => setDraftNarrative(e.target.value)}
                placeholder="What happened today? Crew progress, notable events, context…"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-blue-500/40 disabled:opacity-60"
              />
            </label>
          </div>
        </div>

        {sections.map((key) => (
          <SectionEditor
            key={key}
            sectionKey={key}
            value={draftSections[key]}
            editing={editing}
            project={project}
            onChange={(v) => updateSection(key, v)}
          />
        ))}

        {log && (
          <PhotosBlock
            log={log}
            editable={editing || (canEdit && !editing)}
            onUpload={(file) => onPhotoUpload(log.id, file)}
            onDelete={onPhotoDelete}
            photos={photos}
          />
        )}

        {editing && (
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-2xl border border-white/10 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white/60 transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingBusy}
              className="rounded-2xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingBusy ? "Saving…" : "Save draft"}
            </button>
          </div>
        )}

        {!editing && log && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">
              {log.submitted_at && <span>Submitted {fmtDate(log.submitted_at)} · </span>}
              {log.approved_at && <span>Approved {fmtDate(log.approved_at)}</span>}
            </div>
            <div className="flex gap-2 flex-wrap">
              {log.status === "draft" && log.author_user_id === props.myUserId && (
                <button
                  type="button"
                  onClick={() => void onTransition(log.id, "submit")}
                  className="flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-xs font-black uppercase tracking-[0.2em] text-white hover:bg-blue-500"
                >
                  <Send size={12} /> Submit for approval
                </button>
              )}
              {log.status === "rejected" && log.author_user_id === props.myUserId && (
                <button
                  type="button"
                  onClick={() => void onTransition(log.id, "submit")}
                  className="flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-xs font-black uppercase tracking-[0.2em] text-white hover:bg-blue-500"
                >
                  <Send size={12} /> Resubmit
                </button>
              )}
              {log.status === "submitted" && canReview && (
                <>
                  <button
                    type="button"
                    onClick={() => void onTransition(log.id, "approve")}
                    className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-[0.2em] text-white hover:bg-emerald-500"
                  >
                    <CheckCircle size={12} /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRejectingId(log.id); setReviewerComment(""); }}
                    className="flex items-center gap-2 rounded-2xl bg-red-600/80 px-4 py-2.5 text-xs font-black uppercase tracking-[0.2em] text-white hover:bg-red-600"
                  >
                    <X size={12} /> Reject
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </form>

      {rejectingId && log && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="glass-card p-6 border-white/10 bg-[#0f172a] max-w-md w-full space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-white">Reject daily log</h3>
            <p className="text-xs text-white/60">Add a short note so the author knows what to fix.</p>
            <textarea
              rows={3}
              value={reviewerComment}
              onChange={(e) => setReviewerComment(e.target.value)}
              placeholder="e.g. Photos missing for the safety section."
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-500/40"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRejectingId(null)}
                className="rounded-2xl border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-white/60 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onTransition(rejectingId, "reject", reviewerComment.trim());
                  setRejectingId(null);
                }}
                className="rounded-2xl bg-red-600 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-white hover:bg-red-500"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section editor (dispatches by section key) ──────────────────────────────
function SectionEditor({
  sectionKey,
  value,
  editing,
  project,
  onChange,
}: {
  sectionKey: string;
  value: unknown;
  editing: boolean;
  project: Project;
  onChange: (v: unknown) => void;
}) {
  if (sectionKey === "narrative_only") return null;

  if (sectionKey === "weather") {
    return <WeatherSection value={value} editing={editing} project={project} onChange={onChange} />;
  }
  if (sectionKey === "crew") {
    return <CrewSection value={value} editing={editing} onChange={onChange} />;
  }
  return <TextSection sectionKey={sectionKey} value={value} editing={editing} onChange={onChange} />;
}

function WeatherSection({
  value,
  editing,
  project,
  onChange,
}: {
  value: unknown;
  editing: boolean;
  project: Project;
  onChange: (v: unknown) => void;
}) {
  const w = coerceWeather(value);
  const hasAuto = !!w.source;
  const noGPS = !project.latitude_center && !project.longitude_center;
  return (
    <div className="glass-card p-5 border-white/5 bg-white/[0.02] space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {w.summary === "Clear" ? <CloudSun size={16} className="text-amber-400" /> : <Cloud size={16} className="text-sky-400" />}
          <h3 className="text-xs font-black uppercase tracking-widest text-white/60">{sectionLabel("weather")}</h3>
        </div>
        {hasAuto && (
          <span className="text-[10px] font-bold text-emerald-400/70 uppercase tracking-widest">Auto · Open-Meteo</span>
        )}
      </header>
      {noGPS && !hasAuto && editing && (
        <p className="text-[10px] text-white/40 uppercase tracking-widest">
          Set project latitude/longitude to auto-fetch weather.
        </p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <WeatherField label="Summary" disabled={!editing} value={w.summary ?? ""} onChange={(v) => onChange({ ...w, summary: v })} />
        <WeatherNumberField label="Temp (°C)" disabled={!editing} value={w.temp_c} onChange={(v) => onChange({ ...w, temp_c: v })} />
        <WeatherNumberField label="Wind (kph)" disabled={!editing} value={w.wind_kph} onChange={(v) => onChange({ ...w, wind_kph: v })} />
        <WeatherNumberField label="Precip (mm)" disabled={!editing} value={w.precipitation_mm} onChange={(v) => onChange({ ...w, precipitation_mm: v })} />
      </div>
    </div>
  );
}

function WeatherField({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <label className="space-y-1 block">
      <span className="text-[10px] font-black uppercase tracking-widest text-white/30">{label}</span>
      <input
        type="text"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/40 disabled:opacity-60"
      />
    </label>
  );
}

function WeatherNumberField({ label, value, disabled, onChange }: { label: string; value: number | undefined; disabled: boolean; onChange: (v: number | undefined) => void }) {
  return (
    <label className="space-y-1 block">
      <span className="text-[10px] font-black uppercase tracking-widest text-white/30">{label}</span>
      <input
        type="number"
        step="0.1"
        disabled={disabled}
        value={typeof value === "number" && !Number.isNaN(value) ? value : ""}
        onChange={(e) => {
          const raw = e.target.value.trim();
          onChange(raw === "" ? undefined : Number(raw));
        }}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/40 disabled:opacity-60"
      />
    </label>
  );
}

function CrewSection({ value, editing, onChange }: { value: unknown; editing: boolean; onChange: (v: unknown) => void }) {
  const crew = coerceCrew(value);
  const total = crew.reduce((sum, c) => sum + c.count, 0);
  const addEntry = (trade: string) => {
    const t = trade.trim();
    if (!t) return;
    if (crew.some((c) => c.trade === t)) return;
    onChange([...crew, { trade: t, count: 1 }]);
  };
  const updateEntry = (idx: number, patch: Partial<CrewEntry>) => {
    onChange(crew.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };
  const removeEntry = (idx: number) => onChange(crew.filter((_, i) => i !== idx));

  return (
    <div className="glass-card p-5 border-white/5 bg-white/[0.02] space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-emerald-400" />
          <h3 className="text-xs font-black uppercase tracking-widest text-white/60">{sectionLabel("crew")}</h3>
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{total} on site</span>
      </header>
      {crew.length === 0 && !editing && <p className="text-xs text-white/30">No crew recorded.</p>}
      {crew.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {crew.map((entry, idx) => (
            <div key={`${entry.trade}-${idx}`} className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/5">
              <input
                type="text"
                disabled={!editing}
                value={entry.trade}
                onChange={(e) => updateEntry(idx, { trade: e.target.value })}
                className="flex-1 bg-transparent text-xs text-white/80 outline-none disabled:opacity-80"
              />
              <input
                type="number"
                disabled={!editing}
                value={entry.count}
                onChange={(e) => updateEntry(idx, { count: Number(e.target.value) || 0 })}
                className="w-14 bg-white/5 border border-white/10 rounded-lg text-center py-1 text-xs text-white disabled:opacity-80"
              />
              {editing && (
                <button type="button" onClick={() => removeEntry(idx)} className="text-white/30 hover:text-red-400">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && (
        <input
          type="text"
          placeholder="Add trade (e.g. machinist) — press Enter"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addEntry((e.currentTarget as HTMLInputElement).value);
              (e.currentTarget as HTMLInputElement).value = "";
            }
          }}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none focus:border-blue-500/40"
        />
      )}
    </div>
  );
}

function TextSection({ sectionKey, value, editing, onChange }: { sectionKey: string; value: unknown; editing: boolean; onChange: (v: unknown) => void }) {
  const text = coerceText(value);
  return (
    <div className="glass-card p-5 border-white/5 bg-white/[0.02] space-y-3">
      <h3 className="text-xs font-black uppercase tracking-widest text-white/60">{sectionLabel(sectionKey)}</h3>
      <textarea
        rows={3}
        disabled={!editing}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder={editing ? `Notes on ${sectionLabel(sectionKey).toLowerCase()}…` : ""}
        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-blue-500/40 disabled:opacity-60"
      />
    </div>
  );
}

function PhotosBlock({
  log,
  editable,
  onUpload,
  onDelete,
  photos,
}: {
  log: DailyLog;
  editable: boolean;
  onUpload: (file: File) => Promise<void>;
  onDelete: (photoId: string) => Promise<void>;
  photos: DailyLogPhoto[];
}) {
  return (
    <div className="glass-card p-5 border-white/5 bg-white/[0.02] space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImagePlus size={16} className="text-white/50" />
          <h3 className="text-xs font-black uppercase tracking-widest text-white/60">Photos</h3>
          <span className="text-[10px] font-bold text-white/30">({photos.length})</span>
        </div>
        {editable && (
          <label className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-white/70 border border-white/10">
            <Plus size={12} /> Add photo
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
        )}
      </header>
      {photos.length === 0 ? (
        <p className="text-xs text-white/30">No photos attached yet.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="relative group rounded-xl overflow-hidden border border-white/10 bg-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.caption || "photo"} className="w-full h-32 object-cover" />
              {editable && (
                <button
                  type="button"
                  onClick={() => void onDelete(p.id)}
                  className="absolute top-1 right-1 bg-black/70 rounded-lg p-1 text-red-300 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
