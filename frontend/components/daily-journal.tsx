"use client";

import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle, Cloud, CloudSun, History, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "./ui/confirm-dialog";

type DailyLog = {
  id: string;
  date: string;
  weather: string;
  headcount: number;
  manpower_json?: string;
  narrative: string;
  accidents: string;
  status: string;
};

type Project = {
  id: string;
  name: string;
};

const emptyForm = {
  id: "",
  date: new Date().toISOString().slice(0, 10),
  weather: "sunny",
  headcount: 0,
  manpower_json: "{}",
  narrative: "",
  accidents: "",
  status: "submitted",
};

function safeParseJSON(s: string | undefined): Record<string, number> {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

export function DailyJournal({ project, session }: { project: Project; session: any }) {
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    void fetchLogs();
  }, [project.id]);

  async function fetchLogs() {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/projects/${project.id}/daily-logs`, {
        headers: { Authorization: `Bearer ${session?.access_token || ""}` },
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      const sorted = Array.isArray(data) ? data.sort((a: DailyLog, b: DailyLog) => b.date.localeCompare(a.date)) : [];
      setLogs(sorted);
    } catch (error) {
      console.error(error);
      toast.error("Could not load the daily log.");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.date || !form.narrative.trim()) {
      toast.error("Date and narrative are required.");
      return;
    }
    setSubmitting(true);
    try {
      const endpoint = form.id ? `/api/v1/daily-logs/${form.id}` : `/api/v1/projects/${project.id}/daily-logs`;
      const method = form.id ? "PATCH" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          date: form.date,
          weather: form.weather,
          headcount: Number(form.headcount),
          manpower_json: form.manpower_json,
          narrative: form.narrative.trim(),
          accidents: form.accidents.trim(),
          status: form.status,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);
      setForm(emptyForm);
      setShowForm(false);
      toast.success(form.id ? "Daily log updated." : "Daily log created.");
      await fetchLogs();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not save the daily log.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(logId: string) {
    setConfirmDeleteId(null);
    setDeletingId(logId);
    try {
      const res = await fetch(`/api/v1/daily-logs/${logId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token || ""}` },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);
      toast.success("Daily log deleted.");
      await fetchLogs();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not delete the daily log.");
    } finally {
      setDeletingId(null);
    }
  }

  const weatherIcons: Record<string, React.ReactNode> = {
    sunny: <CloudSun size={18} className="text-amber-400" />,
    cloudy: <Cloud size={18} className="text-blue-400" />,
    rainy: <Cloud size={18} className="text-sky-400" />,
  };

  const submittedLogs = useMemo(() => logs.filter((log) => log.status === "submitted").length, [logs]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete daily log?"
        body="This will permanently remove the entry."
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirmDeleteId && void handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">Daily Log</h2>
          <p className="text-xs font-bold uppercase tracking-widest text-white/30 mt-1">Historical project log</p>
        </div>
        <button
          onClick={() => {
            setForm(emptyForm);
            setShowForm((current) => !current);
          }}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-[0.2em] transition-all shadow-lg shadow-blue-900/40 active:scale-95"
        >
          <Plus size={16} />
          Add Entry
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="glass-card p-6 border-white/5 bg-white/[0.02] space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Date</span>
              <input
                type="date"
                value={form.date}
                onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-blue-500/40"
              />
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Weather</span>
              <select
                value={form.weather}
                onChange={(event) => setForm((current) => ({ ...current, weather: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-[#0f172a] px-4 py-3 text-sm text-white outline-none focus:border-blue-500/40"
              >
                 <option value="sunny">Sunny</option>
                 <option value="cloudy">Cloudy</option>
                 <option value="rainy">Rainy</option>
              </select>
            </label>
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                 <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Staffing by Specialty</span>
                <div className="flex items-center gap-2">
                  <input
                    id="new-trade-name"
                     placeholder="Specialty (e.g., machining)"
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white w-32 focus:border-blue-500/40 outline-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const trade = (e.currentTarget as HTMLInputElement).value.trim();
                        if (trade) {
                          const mp = safeParseJSON(form.manpower_json);
                          mp[trade] = 1;
                          const total = Object.values(mp).reduce((a: any, b: any) => a + Number(b), 0);
                          setForm({ ...form, manpower_json: JSON.stringify(mp), headcount: Number(total) });
                          (e.currentTarget as HTMLInputElement).value = "";
                        }
                      }
                    }}
                  />
                   <span className="text-[10px] font-black text-blue-400/40 tracking-tighter">Press Enter to add</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(safeParseJSON(form.manpower_json)).map(([trade, count]) => (
                  <div key={trade} className="flex items-center gap-3 bg-white/5 p-2 rounded-xl border border-white/5">
                    <span className="flex-1 text-[10px] font-bold text-white/60 uppercase truncate">{trade}</span>
                    <input
                      type="number"
                      value={Number(count)}
                      onChange={(e) => {
                        const mp = safeParseJSON(form.manpower_json);
                        mp[trade] = Number(e.target.value);
                        const total = Object.values(mp).reduce((a: any, b: any) => a + Number(b), 0);
                        setForm({ ...form, manpower_json: JSON.stringify(mp), headcount: Number(total) });
                      }}
                      className="w-12 bg-white/5 border border-white/10 rounded-lg text-center py-1 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const mp = safeParseJSON(form.manpower_json);
                        delete mp[trade];
                        const total = Object.values(mp).reduce((a: any, b: any) => a + Number(b), 0);
                        setForm({ ...form, manpower_json: JSON.stringify(mp), headcount: Number(total) });
                      }}
                      className="text-white/20 hover:text-red-400"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <label className="space-y-2">
               <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Status</span>
              <select
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-[#0f172a] px-4 py-3 text-sm text-white outline-none focus:border-blue-500/40"
              >
                 <option value="submitted">Submitted</option>
                 <option value="draft">Draft</option>
              </select>
            </label>
          </div>

          <label className="block space-y-2">
             <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Narrative</span>
            <textarea
              rows={4}
              value={form.narrative}
              onChange={(event) => setForm((current) => ({ ...current, narrative: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-blue-500/40"
            />
          </label>

          <label className="block space-y-2">
             <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Issues</span>
            <textarea
              rows={3}
              value={form.accidents}
              onChange={(event) => setForm((current) => ({ ...current, accidents: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-blue-500/40"
            />
          </label>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setForm(emptyForm);
              }}
              className="rounded-2xl border border-white/10 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white/60 transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-2xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Saving..." : form.id ? "Update entry" : "Save entry"}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 space-y-4">
          {logs.map((log) => (
            <div key={log.id} className="glass-card p-6 border-white/5 bg-white/[0.02] relative group overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setForm({
                      ...log,
                      manpower_json: log.manpower_json || "{}",
                    });
                    setShowForm(true);
                  }}
                  className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10 text-white/40 hover:text-white transition-colors"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(log.id)}
                  disabled={deletingId === log.id}
                  className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center border border-red-500/20 text-red-300/60 hover:text-red-200 transition-colors disabled:opacity-40"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="flex flex-col md:flex-row gap-6">
                <div className="md:w-48 shrink-0">
                  <div className="flex items-center gap-2 text-white/40 mb-3">
                    <History size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">{log.date}</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/5">
                        {weatherIcons[log.weather] || <Cloud size={18} className="text-white/20" />}
                      </div>
                      <span className="text-xs font-bold text-white/60 capitalize">{log.weather}</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Users size={14} className="text-emerald-400/60" />
                        <span className="text-[10px] font-black text-white/60">{log.headcount} Total</span>
                      </div>
                      <div className="pl-5 space-y-1">
                        {Object.entries(JSON.parse(log.manpower_json || "{}")).map(([trade, count]) => (
                          <div key={trade} className="text-[9px] font-bold text-white/30 uppercase flex justify-between">
                            <span>{trade}:</span>
                            <span className="text-white/60">{Number(count)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 space-y-4 border-l border-white/5 pl-6">
                  <p className="text-sm text-white/70 leading-relaxed font-medium">{log.narrative}</p>

                  {log.accidents && (
                    <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertCircle size={14} className="text-red-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-red-400">Issues / Blockers</span>
                      </div>
                      <p className="text-xs font-medium text-red-300/80">{log.accidents}</p>
                    </div>
                  )}

                  <div className="pt-2 flex items-center gap-2">
                    <CheckCircle size={12} className="text-emerald-500/60" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/20">
                      {log.status === "draft" ? "Operational draft" : "Submitted report"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {logs.length === 0 && !loading && (
            <div className="py-24 text-center glass-card border-dashed border-white/10">
              <History className="mx-auto text-white/10 mb-4" size={48} />
              <div className="text-sm font-bold text-white/20 uppercase tracking-[0.2em]">No log history yet</div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="glass-card p-6 border-white/5 bg-white/[0.02]">
            <h3 className="text-xs font-black uppercase tracking-widest text-white/40 mb-4">Project Status</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-white/40">Continuity</span>
                <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest">Active</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-white/40">Entries</span>
                <span className="text-sm font-black text-white">{logs.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-white/40">Submitted</span>
                <span className="text-sm font-black text-white">{submittedLogs}</span>
              </div>
            </div>
          </div>

          <div className="glass-card p-6 border-amber-500/20 bg-amber-500/[0.02]">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="text-amber-400" size={18} />
              <h3 className="text-xs font-black uppercase tracking-widest text-amber-400">Reminder</h3>
            </div>
            <p className="text-[10px] font-bold text-white/40 leading-relaxed uppercase tracking-wider">
              Add, edit, or correct the daily log right here. This section is no longer read-only.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
