"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  parseISO,
  startOfMonth,
  endOfMonth,
  addMonths,
  format,
  differenceInMilliseconds,
  isValid,
} from "date-fns";
import { es } from "date-fns/locale";

type Task = {
  id: string;
  title: string;
  status: string;
  start_date: string;
  end_date: string;
  progress_percent: number;
  budget_cents: number;
  spent_cents: number;
  predecessor_task_id?: string;
};

type Deliverable = {
  id: string;
  task_id: string;
  title: string;
  due_date: string;
  status: string;
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

type GanttTimelineProps = {
  tasks: Task[];
  deliverables: Deliverable[];
  allEvidences: Map<string, Evidence[]>;
  highlightDeliverableId?: string | null;
  onDeliverableClick?: (deliverableId: string, taskId: string) => void;
  onEvidenceClick?: (evidence: Evidence) => void;
  onTaskClick?: (taskId: string) => void;
};

const MONTH_WIDTH = 180;
const ROW_HEIGHT = 80;
const LABEL_WIDTH = 200;
const BAR_TOP = 16;
const BAR_HEIGHT = 26;
const BUDGET_TOP = BAR_TOP + BAR_HEIGHT + 4;
const BUDGET_HEIGHT = 5;
const PHOTO_TOP = BUDGET_TOP + BUDGET_HEIGHT + 6;

function barColor(status: string) {
  switch (status) {
    case "completed":  return "#10b981";
    case "in_progress": return "#3b82f6";
    default:           return "#9ca3af";
  }
}

function parseSafe(date: string): Date | null {
  if (!date) return null;
  const d = parseISO(date);
  return isValid(d) ? d : null;
}

function buildMonths(start: Date, end: Date): Array<{ label: string; startMs: number; endMs: number }> {
  const months: Array<{ label: string; startMs: number; endMs: number }> = [];
  let cursor = startOfMonth(start);
  const last = endOfMonth(end);
  while (cursor <= last) {
    const mEnd = endOfMonth(cursor);
    months.push({
      label: format(cursor, "MMM yyyy", { locale: es }),
      startMs: cursor.getTime(),
      endMs: mEnd.getTime(),
    });
    cursor = addMonths(cursor, 1);
  }
  return months;
}

export function GanttTimeline({
  tasks,
  deliverables,
  allEvidences,
  highlightDeliverableId,
  onDeliverableClick,
  onEvidenceClick,
  onTaskClick,
}: GanttTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [highlightedLocal, setHighlightedLocal] = useState<string | null>(null);

  // ── Memoized time axis ─────────────────────────────────────────────────
  const { axisStart, axisEnd, months, totalMs, totalWidth } = useMemo(() => {
    const validTasks = tasks.filter((t) => parseSafe(t.start_date) && parseSafe(t.end_date));
    let tStart: Date | null = null;
    let tEnd: Date | null = null;
    for (const t of validTasks) {
      const s = parseSafe(t.start_date)!;
      const e = parseSafe(t.end_date)!;
      if (!tStart || s < tStart) tStart = s;
      if (!tEnd || e > tEnd) tEnd = e;
    }
    if (!tStart || !tEnd) {
      const today = new Date();
      tStart = startOfMonth(today);
      tEnd = addMonths(tStart, 2);
    }
    const aStart = startOfMonth(tStart);
    const aEnd = endOfMonth(tEnd);
    const ms = differenceInMilliseconds(aEnd, aStart) || 1;
    const mths = buildMonths(aStart, aEnd);
    return { axisStart: aStart, axisEnd: aEnd, months: mths, totalMs: ms, totalWidth: mths.length * MONTH_WIDTH };
  }, [tasks]);

  // ── Critical Path Calculation (CPM) ──────────────────────────────────
  const criticalPathIds = useMemo(() => {
    if (tasks.length === 0) return new Set<string>();

    const tasksById = new Map<string, Task>();
    const successors = new Map<string, string[]>();
    for (const t of tasks) {
      tasksById.set(t.id, t);
      if (t.predecessor_task_id) {
        if (!successors.has(t.predecessor_task_id)) successors.set(t.predecessor_task_id, []);
        successors.get(t.predecessor_task_id)!.push(t.id);
      }
    }

    // Forward pass: Calculate Earliest Finish (EF)
    const efMap = new Map<string, number>();
    function getEF(id: string): number {
      if (efMap.has(id)) return efMap.get(id)!;
      const t = tasksById.get(id)!;
      const start = parseSafe(t.start_date)?.getTime() || 0;
      const end = parseSafe(t.end_date)?.getTime() || start;
      const duration = end - start;
      
      if (!t.predecessor_task_id) {
        efMap.set(id, start + duration);
        return start + duration;
      }
      
      const predEF = getEF(t.predecessor_task_id);
      const ef = Math.max(start, predEF) + duration;
      efMap.set(id, ef);
      return ef;
    }
    
    tasks.forEach(t => getEF(t.id));
    const projectEnd = Math.max(...Array.from(efMap.values()));

    // Backward pass: Calculate Latest Finish (LF)
    const lfMap = new Map<string, number>();
    function getLF(id: string): number {
      if (lfMap.has(id)) return lfMap.get(id)!;
      const t = tasksById.get(id)!;
      const start = parseSafe(t.start_date)?.getTime() || 0;
      const end = parseSafe(t.end_date)?.getTime() || start;
      const duration = end - start;

      const succIds = successors.get(id) || [];
      if (succIds.length === 0) {
        lfMap.set(id, projectEnd);
        return projectEnd;
      }

      const minSuccLS = Math.min(...succIds.map(sid => {
        const lf = getLF(sid);
        const st = parseSafe(tasksById.get(sid)!.start_date)?.getTime() || 0;
        const en = parseSafe(tasksById.get(sid)!.end_date)?.getTime() || st;
        return lf - (en - st);
      }));
      
      lfMap.set(id, minSuccLS);
      return minSuccLS;
    }

    const path = new Set<string>();
    tasks.forEach(t => {
      const ef = efMap.get(t.id)!;
      const lf = getLF(t.id)!;
      // Float = LF - EF. We use a small threshold (1 hour) for precision issues
      if (Math.abs(lf - ef) < 3600000) {
        path.add(t.id);
      }
    });

    return path;
  }, [tasks]);

  // ── Memoized deliverable grouping (O(m) not O(n*m)) ─────────────────────
  const deliverablesByTask = useMemo(() => {
    const map = new Map<string, Deliverable[]>();
    for (const d of deliverables) {
      if (!map.has(d.task_id)) map.set(d.task_id, []);
      map.get(d.task_id)!.push(d);
    }
    return map;
  }, [deliverables]);

  function toPx(date: Date): number {
    const ms = differenceInMilliseconds(date, axisStart);
    return (ms / totalMs) * totalWidth;
  }

  // ── Scroll to highlighted deliverable ───────────────────────────────────
  useEffect(() => {
    if (!highlightDeliverableId) return;
    const d = deliverables.find((del) => del.id === highlightDeliverableId);
    if (!d) return;
    const task = tasks.find((t) => t.id === d.task_id);
    if (!task) return;
    const targetDate = parseSafe(task.start_date);
    if (!targetDate) return;
    const leftPx = toPx(targetDate);
    scrollRef.current?.scrollTo({ left: Math.max(0, leftPx - 40), behavior: "smooth" });
    setHighlightedLocal(highlightDeliverableId);
    const timer = setTimeout(() => setHighlightedLocal(null), 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightDeliverableId]);

  if (tasks.length === 0) {
    return (
      <div className="gantt-root">
        <div className="gantt-empty">
          There are no dated tasks to display on the timeline.
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="gantt-root" style={{ maxHeight: ROW_HEIGHT * tasks.length + 80 + "px" }}>
      {/* Label column */}
      <div className="gantt-labels">
        <div className="gantt-label-header">Task</div>
        {tasks.map((task) => (
          <div key={task.id} className="gantt-label-row">
            <div className="gantt-label-title" style={{ color: criticalPathIds.has(task.id) ? "#ef4444" : "white" }}>
              {task.title} {criticalPathIds.has(task.id) && <span className="text-[9px] border border-red-500/30 text-red-400 px-1 rounded ml-1">CRITICAL PATH</span>}
            </div>
            <div className="gantt-label-meta">
              {task.progress_percent}% · {task.status}
            </div>
          </div>
        ))}
      </div>

      {/* Scrollable chart */}
      <div className="gantt-scroll" ref={scrollRef}>
        <div className="gantt-chart" style={{ width: totalWidth }}>
          {/* Month headers */}
          <div className="gantt-months">
            {months.map((m, i) => (
              <div key={i} className="gantt-month">
                {m.label}
              </div>
            ))}
          </div>

          {/* Rows */}
          <div className="gantt-rows" style={{ height: tasks.length * ROW_HEIGHT }}>
            {/* Vertical grid lines */}
            {months.map((_, i) => (
              <div
                key={i}
                className="gantt-grid-line"
                style={{ left: i * MONTH_WIDTH }}
              />
            ))}

            {/* Today line */}
            {(() => {
              const today = new Date();
              if (today >= axisStart && today <= axisEnd) {
                return (
                  <div
                    className="gantt-today-line"
                    style={{ left: toPx(today) }}
                      title="Today"
                  />
                );
              }
              return null;
            })()}

            {/* Dependency lines (SVG Layer) */}
            <svg
              className="absolute inset-0 pointer-events-none"
              style={{ width: totalWidth, height: tasks.length * ROW_HEIGHT, zIndex: 10 }}
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="7"
                  refX="10"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7" fill="#60a5fa" />
                </marker>
                <marker
                  id="arrowhead-critical"
                  markerWidth="10"
                  markerHeight="7"
                  refX="10"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
                </marker>
              </defs>
              {tasks.map((task, rowIndex) => {
                if (!task.predecessor_task_id) return null;
                const predIndex = tasks.findIndex((t) => t.id === task.predecessor_task_id);
                if (predIndex === -1) return null;

                const pred = tasks[predIndex];
                const pStart = parseSafe(pred.start_date);
                const pEnd = parseSafe(pred.end_date);
                const tStart = parseSafe(task.start_date);

                if (!pStart || !pEnd || !tStart) return null;

                const x1 = toPx(pEnd);
                const y1 = predIndex * ROW_HEIGHT + BAR_TOP + BAR_HEIGHT / 2;
                const x2 = toPx(tStart);
                const y2 = rowIndex * ROW_HEIGHT + BAR_TOP + BAR_HEIGHT / 2;

                const isCriticalDep = criticalPathIds.has(task.id) && criticalPathIds.has(pred.id);

                // Path: Exit right, vertical jump, enter left
                const midX = x1 + (x2 - x1) / 2;
                // If the tasks are overlapping or backwards, we handle it with a simple path
                const points = x2 > x1 + 10 
                  ? `${x1},${y1} ${midX},${y1} ${midX},${y2} ${x2},${y2}`
                  : `${x1},${y1} ${x1+10},${y1} ${x1+10},${y1 + (y2-y1)/2} ${x2-10},${y1 + (y2-y1)/2} ${x2-10},${y2} ${x2},${y2}`;

                return (
                  <polyline
                    key={`dep-${task.id}`}
                    points={points}
                    fill="none"
                    stroke={isCriticalDep ? "#ef4444" : "#60a5fa"}
                    strokeWidth={isCriticalDep ? "2" : "1.5"}
                    strokeDasharray={task.status === "pending" ? "4 2" : "0"}
                    markerEnd={isCriticalDep ? "url(#arrowhead-critical)" : "url(#arrowhead)"}
                    className="opacity-40 hover:opacity-100 transition-opacity"
                  />
                );
              })}
            </svg>

            {tasks.map((task, rowIndex) => {
              const start = parseSafe(task.start_date);
              const end = parseSafe(task.end_date);
              const taskDeliverables = (deliverablesByTask.get(task.id) as Deliverable[]) ?? [];
              const taskEvidences = allEvidences.get(task.id) ?? [];
              const top = rowIndex * ROW_HEIGHT;
              const isTaskCritical = criticalPathIds.has(task.id);

              const barLeft = start ? toPx(start) : 0;
              const barWidth = start && end ? Math.max(6, toPx(end) - toPx(start)) : 0;
              const budgetWidth =
                task.budget_cents > 0
                  ? barWidth * Math.min((task.spent_cents || 0) / task.budget_cents, 1)
                  : 0;

              return (
                <div
                  key={task.id}
                  className="gantt-row"
                  style={{ position: "absolute", top, left: 0, right: 0 }}
                >
                  <div className={`gantt-row-bg ${rowIndex % 2 === 0 ? "even" : "odd"}`} />

                  {/* Task bar */}
                  {start && end && (
                    <button
                      type="button"
                      className={`gantt-bar group ${isTaskCritical ? "ring-2 ring-red-500 ring-offset-2 ring-offset-black/20" : ""}`}
                      style={{
                        left: barLeft,
                        width: barWidth,
                        background: barColor(task.status),
                        top: BAR_TOP,
                        height: BAR_HEIGHT,
                        border: isTaskCritical ? "1px solid #ef4444" : "none",
                        padding: 0,
                      }}
                      onClick={() => onTaskClick?.(task.id)}
                      title={`${isTaskCritical ? "[CRITICAL PATH] " : ""}Click to edit: ${task.title} · ${task.progress_percent}%`}
                    >
                      <div
                        className="gantt-bar-progress"
                        style={{ width: `${task.progress_percent}%` }}
                      />
                      <span className="gantt-bar-label" style={{ maxWidth: barWidth - 16 }}>
                        {task.progress_percent}%
                      </span>
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-white/10 transition-opacity" />
                    </button>
                  )}

                  {/* Budget strip */}
                  {budgetWidth > 0 && (
                    <div
                      className="gantt-budget-strip"
                      style={{
                        left: barLeft,
                        width: budgetWidth,
                        top: BUDGET_TOP,
                        height: BUDGET_HEIGHT,
                      }}
                      title={`Budget spent`}
                    />
                  )}

                  {/* Deliverable markers */}
                  {taskDeliverables.map((d) => {
                    const dDate = parseSafe(d.due_date);
                    if (!dDate) return null;
                    const dLeft = toPx(dDate);
                    const isHighlighted = d.id === highlightedLocal;
                    return (
                      <button
                        key={d.id}
                        className={`gantt-deliverable-pin ${isHighlighted ? "highlighted" : ""}`}
                        style={{ left: dLeft, top: BAR_TOP - 8 }}
                        onClick={() => onDeliverableClick?.(d.id, task.id)}
                        title={`${d.title} · ${d.due_date}`}
                        aria-label={`Deliverable: ${d.title}`}
                      >
                        {d.status === "approved" ? "🟢" : "◆"}
                      </button>
                    );
                  })}

                  {/* Evidence photo pins */}
                  {taskEvidences.map((e) => {
                    const eDate = e.created_at ? parseSafe(e.created_at) : null;
                    if (!eDate) return null;
                    const eLeft = toPx(eDate);
                    return (
                      <button
                        key={e.id}
                        className="gantt-photo-pin"
                        style={{ left: eLeft, top: PHOTO_TOP }}
                        onClick={() => onEvidenceClick?.(e)}
                        aria-label={`Evidence: ${e.file_name}`}
                        title={`${e.file_name} · Score: ${e.quality_score}`}
                      >
                        <img
                          src={e.url_archivo}
                          alt={e.file_name}
                          onError={(ev) => {
                            (ev.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>

    {/* Legend */}
    <div className="gantt-legend">
      <div className="gantt-legend-item">
        <div className="gantt-legend-dot" style={{ background: "#9ca3af" }} />
        Pending
      </div>
      <div className="gantt-legend-item">
        <div className="gantt-legend-dot" style={{ background: "#3b82f6" }} />
        In progress
      </div>
      <div className="gantt-legend-item">
        <div className="gantt-legend-dot" style={{ background: "#10b981" }} />
        Completed
      </div>
      <div className="gantt-legend-item">
        <div className="gantt-legend-strip" style={{ background: "#f59e0b" }} />
        Budget spent
      </div>
      <div className="gantt-legend-item">
        <span style={{ fontSize: 13 }}>◆</span>
        Deliverable (click to navigate)
      </div>
      <div className="gantt-legend-item">
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "#e5e7eb",
            border: "2px solid white",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }}
        />
        Photo evidence
      </div>
      <div className="gantt-legend-item">
        <div style={{ width: 2, height: 14, background: "#ef4444" }} />
        Today
      </div>
    </div>
    </>
  );
}
