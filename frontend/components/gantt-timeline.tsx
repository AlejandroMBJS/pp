"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  addDays,
  addMonths,
  format,
  differenceInCalendarDays,
  isValid,
} from "date-fns";
import { es } from "date-fns/locale";
import type { GanttZoomLevel } from "./ui/gantt-zoom-control";
import { withAccessToken } from "../lib/files";

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
  color_hex?: string;
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

type TaskTimelinePatch = {
  start_date?: string;
  end_date?: string;
  status?: string;
  progress_percent?: number;
  predecessor_task_id?: string | null;
  color_hex?: string;
};

type GanttTimelineProps = {
  tasks: Task[];
  deliverables: Deliverable[];
  allEvidences: Map<string, Evidence[]>;
  highlightDeliverableId?: string | null;
  onDeliverableClick?: (deliverableId: string, taskId: string) => void;
  onEvidenceClick?: (evidence: Evidence) => void;
  onTaskClick?: (taskId: string) => void;
  zoomLevel?: GanttZoomLevel;
  // JWT used to authenticate `<img>` requests for evidence thumbs against
  // /api/v1/files/. Without it, native img loads return 401 and pins render
  // empty.
  accessToken?: string;
  // PR-B: when supplied, bars become draggable (move + resize). When omitted,
  // the Gantt is read-only — used for helper/client roles.
  onTaskTimelinePatch?: (taskId: string, patch: TaskTimelinePatch) => void;
};

type DragMode = "move" | "resize-l" | "resize-r";

type DragState = {
  taskId: string;
  mode: DragMode;
  originX: number;
  originStart: Date;
  originEnd: Date;
  dxDays: number;
};

type DragGhost = {
  taskId: string;
  left: number;
  width: number;
};

// PR-C: Dependency drag — separate state because it tracks chart-relative
// pointer coords (not bar-relative) and a hovered drop target.
type DepDragState = {
  sourceId: string;
  pointerId: number;
  startX: number;
  startY: number;
};

type DepGhost = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

// Pixels-per-day per zoom level. Day:big-and-spacious, Month:dense overview.
const DAY_WIDTH: Record<GanttZoomLevel, number> = {
  day: 40,
  week: 14,
  month: 6,
};
const ROW_HEIGHT = 80;
const LABEL_WIDTH = 200;
const HEADER_HEIGHT = 40;
const BAR_TOP = 16;
const BAR_HEIGHT = 26;
const BUDGET_TOP = BAR_TOP + BAR_HEIGHT + 4;
const BUDGET_HEIGHT = 5;
const PHOTO_TOP = BUDGET_TOP + BUDGET_HEIGHT + 6;

// hexToRgba — used for the row tint so a custom bar color also gently
// colors the entire row background. Returns "" for invalid input so the
// caller can fall back to the default striped CSS.
function hexToRgba(hex: string | undefined, alpha: number): string {
  if (!hex || hex.length < 7 || hex[0] !== "#") return "";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "";
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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

type AxisBucket = { label: string; sublabel?: string; startMs: number; widthDays: number };

/**
 * Build the secondary axis (top row of headers): months, regardless of zoom.
 * In Day zoom we additionally render a primary axis of day numbers below.
 */
function buildMonths(start: Date, end: Date, dayWidth: number): AxisBucket[] {
  const out: AxisBucket[] = [];
  let cursor = startOfMonth(start);
  const last = endOfMonth(end);
  while (cursor <= last) {
    const mEnd = endOfMonth(cursor);
    const days = differenceInCalendarDays(mEnd, cursor) + 1;
    out.push({
      label: format(cursor, "MMM yyyy", { locale: es }),
      startMs: cursor.getTime(),
      widthDays: days,
    });
    cursor = addMonths(cursor, 1);
  }
  return out;
}

function buildWeeks(start: Date, end: Date): AxisBucket[] {
  const out: AxisBucket[] = [];
  let cursor = startOfWeek(start, { weekStartsOn: 1 });
  while (cursor <= end) {
    const wEnd = endOfWeek(cursor, { weekStartsOn: 1 });
    out.push({
      label: format(cursor, "d MMM", { locale: es }),
      sublabel: `S${format(cursor, "w")}`,
      startMs: cursor.getTime(),
      widthDays: 7,
    });
    cursor = addDays(cursor, 7);
  }
  return out;
}

function buildDays(start: Date, end: Date): AxisBucket[] {
  const out: AxisBucket[] = [];
  let cursor = startOfDay(start);
  while (cursor <= end) {
    out.push({
      label: format(cursor, "d"),
      sublabel: format(cursor, "EEE", { locale: es }).slice(0, 3),
      startMs: cursor.getTime(),
      widthDays: 1,
    });
    cursor = addDays(cursor, 1);
  }
  return out;
}

export function GanttTimeline({
  tasks,
  deliverables,
  allEvidences,
  highlightDeliverableId,
  onDeliverableClick,
  onEvidenceClick,
  onTaskClick,
  zoomLevel = "month",
  accessToken,
  onTaskTimelinePatch,
}: GanttTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [highlightedLocal, setHighlightedLocal] = useState<string | null>(null);
  const dayWidth = DAY_WIDTH[zoomLevel];

  // ── PR-B: Drag state ──────────────────────────────────────────────────
  const dragState = useRef<DragState | null>(null);
  const [dragGhost, setDragGhost] = useState<DragGhost | null>(null);
  const canEdit = !!onTaskTimelinePatch;
  // Suppress the bar's onClick if the pointer moved during a drag — the user
  // intended to drag, not navigate. Reset on next pointerdown.
  const suppressNextClick = useRef(false);

  // ── PR-C: Dependency drag state ──────────────────────────────────────
  const depDragState = useRef<DepDragState | null>(null);
  const [depGhost, setDepGhost] = useState<DepGhost | null>(null);
  const [depHoverTargetId, setDepHoverTargetId] = useState<string | null>(null);
  // Ref on the .gantt-rows div so we can convert clientX/Y → chart coords.
  const rowsRef = useRef<HTMLDivElement>(null);

  function startDepDrag(e: React.PointerEvent<HTMLDivElement>, task: Task) {
    if (!canEdit) return;
    const end = parseSafe(task.end_date);
    const rowIndex = tasks.findIndex((t) => t.id === task.id);
    if (!end || rowIndex < 0) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    suppressNextClick.current = true;
    const x1 = toPx(end) + dayWidth;
    const y1 = rowIndex * ROW_HEIGHT + BAR_TOP + BAR_HEIGHT / 2;
    depDragState.current = {
      sourceId: task.id,
      pointerId: e.pointerId,
      startX: x1,
      startY: y1,
    };
    setDepGhost({ x1, y1, x2: x1, y2: y1 });
  }

  function onDepDragMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = depDragState.current;
    if (!drag) return;
    const rowsEl = rowsRef.current;
    if (!rowsEl) return;
    const rect = rowsEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDepGhost({ x1: drag.startX, y1: drag.startY, x2: x, y2: y });
    // Find drop target under the pointer.
    let foundId: string | null = null;
    const els = document.elementsFromPoint(e.clientX, e.clientY);
    for (const el of els) {
      const tid = (el as HTMLElement).getAttribute?.("data-testid");
      if (tid && tid.startsWith("gantt-bar-")) {
        const id = tid.slice("gantt-bar-".length);
        if (id !== drag.sourceId) foundId = id;
        break;
      }
    }
    if (foundId !== depHoverTargetId) setDepHoverTargetId(foundId);
  }

  function endDepDrag(e: React.PointerEvent<HTMLDivElement>) {
    const drag = depDragState.current;
    if (!drag) return;
    depDragState.current = null;
    setDepGhost(null);
    const target = depHoverTargetId;
    setDepHoverTargetId(null);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // pointer was already released
    }
    if (target && target !== drag.sourceId && onTaskTimelinePatch) {
      onTaskTimelinePatch(target, { predecessor_task_id: drag.sourceId });
    }
  }

  function startDrag(
    e: React.PointerEvent<HTMLDivElement>,
    task: Task,
    mode: DragMode
  ) {
    if (!canEdit) return;
    const start = parseSafe(task.start_date);
    const end = parseSafe(task.end_date);
    if (!start || !end) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = {
      taskId: task.id,
      mode,
      originX: e.clientX,
      originStart: start,
      originEnd: end,
      dxDays: 0,
    };
    setDragGhost({
      taskId: task.id,
      left: toPx(start),
      width: Math.max(6, toPx(end) - toPx(start) + dayWidth),
    });
  }

  function onDragMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    if (!drag) return;
    const dx = e.clientX - drag.originX;
    const dxDays = Math.round(dx / dayWidth);
    if (dxDays === drag.dxDays) return;
    drag.dxDays = dxDays;
    if (Math.abs(dxDays) > 0) suppressNextClick.current = true;
    let newStart = drag.originStart;
    let newEnd = drag.originEnd;
    if (drag.mode === "move") {
      newStart = addDays(drag.originStart, dxDays);
      newEnd = addDays(drag.originEnd, dxDays);
    } else if (drag.mode === "resize-l") {
      newStart = addDays(drag.originStart, dxDays);
      if (newStart > drag.originEnd) newStart = drag.originEnd;
    } else {
      newEnd = addDays(drag.originEnd, dxDays);
      if (newEnd < drag.originStart) newEnd = drag.originStart;
    }
    setDragGhost({
      taskId: drag.taskId,
      left: toPx(newStart),
      width: Math.max(6, toPx(newEnd) - toPx(newStart) + dayWidth),
    });
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    if (!drag) return;
    dragState.current = null;
    setDragGhost(null);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // pointer was already released
    }
    if (drag.dxDays === 0) {
      // No-movement pointerup on the mid handle is a click — surface it as
      // onTaskClick so the bar still opens the details modal. The button
      // underneath never fires its native click because the handle div sits
      // on top in the z-stack.
      if (drag.mode === "move") onTaskClick?.(drag.taskId);
      return;
    }
    if (!onTaskTimelinePatch) return;
    let newStart = drag.originStart;
    let newEnd = drag.originEnd;
    if (drag.mode === "move") {
      newStart = addDays(drag.originStart, drag.dxDays);
      newEnd = addDays(drag.originEnd, drag.dxDays);
    } else if (drag.mode === "resize-l") {
      newStart = addDays(drag.originStart, drag.dxDays);
      if (newStart > drag.originEnd) newStart = drag.originEnd;
    } else {
      newEnd = addDays(drag.originEnd, drag.dxDays);
      if (newEnd < drag.originStart) newEnd = drag.originStart;
    }
    onTaskTimelinePatch(drag.taskId, {
      start_date: format(newStart, "yyyy-MM-dd"),
      end_date: format(newEnd, "yyyy-MM-dd"),
    });
  }

  // ── Memoized time axis ─────────────────────────────────────────────────
  const { axisStart, axisEnd, primaryAxis, secondaryAxis, totalWidth } = useMemo(() => {
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
    // Pad axis to whole-month boundaries so the secondary axis is clean.
    const aStart = startOfMonth(tStart);
    const aEnd = endOfMonth(tEnd);
    const totalDays = differenceInCalendarDays(aEnd, aStart) + 1;
    const width = totalDays * dayWidth;

    let primary: AxisBucket[] = [];
    let secondary: AxisBucket[] = buildMonths(aStart, aEnd, dayWidth);
    if (zoomLevel === "day") {
      primary = buildDays(aStart, aEnd);
    } else if (zoomLevel === "week") {
      primary = buildWeeks(aStart, aEnd);
    } else {
      primary = secondary;
      secondary = [];
    }
    return {
      axisStart: aStart,
      axisEnd: aEnd,
      primaryAxis: primary,
      secondaryAxis: secondary,
      totalWidth: width,
    };
  }, [tasks, dayWidth, zoomLevel]);

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

    // Forward pass: Earliest Finish (EF)
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
    tasks.forEach((t) => getEF(t.id));
    const projectEnd = Math.max(...Array.from(efMap.values()));

    // Backward pass: Latest Finish (LF)
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
      const minSuccLS = Math.min(
        ...succIds.map((sid) => {
          const lf = getLF(sid);
          const st = parseSafe(tasksById.get(sid)!.start_date)?.getTime() || 0;
          const en = parseSafe(tasksById.get(sid)!.end_date)?.getTime() || st;
          return lf - (en - st);
        })
      );
      lfMap.set(id, minSuccLS);
      return minSuccLS;
    }

    const path = new Set<string>();
    tasks.forEach((t) => {
      const ef = efMap.get(t.id)!;
      const lf = getLF(t.id)!;
      // Float = LF - EF; tolerate 1h jitter for floating-point safety.
      if (Math.abs(lf - ef) < 3600000) path.add(t.id);
    });
    return path;
  }, [tasks]);

  // ── Memoized deliverable grouping (O(m), not O(n*m)) ────────────────────
  const deliverablesByTask = useMemo(() => {
    const map = new Map<string, Deliverable[]>();
    for (const d of deliverables) {
      if (!map.has(d.task_id)) map.set(d.task_id, []);
      map.get(d.task_id)!.push(d);
    }
    return map;
  }, [deliverables]);

  // Day-based pixel projection. Half-day fractional = differenceInCalendarDays.
  function toPx(date: Date): number {
    return differenceInCalendarDays(date, axisStart) * dayWidth;
  }

  // ── Weekend overlay (Day zoom only) ────────────────────────────────────
  const weekendCols = useMemo(() => {
    if (zoomLevel !== "day") return [] as Array<{ left: number; width: number }>;
    const out: Array<{ left: number; width: number }> = [];
    let cursor = startOfDay(axisStart);
    while (cursor <= axisEnd) {
      const dow = cursor.getDay();
      if (dow === 0 || dow === 6) {
        out.push({ left: toPx(cursor), width: dayWidth });
      }
      cursor = addDays(cursor, 1);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomLevel, axisStart, axisEnd, dayWidth]);

  // ── Scroll to highlighted deliverable ──────────────────────────────────
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
  }, [highlightDeliverableId, dayWidth]);

  if (tasks.length === 0) {
    return (
      <div className="gantt-root">
        <div className="gantt-empty">
          There are no dated tasks to display on the timeline.
        </div>
      </div>
    );
  }

  const showSecondaryAxis = secondaryAxis.length > 0;
  const headerStackHeight = showSecondaryAxis ? HEADER_HEIGHT * 2 : HEADER_HEIGHT;

  return (
    <>
    <div
      className="gantt-root"
      data-zoom={zoomLevel}
      style={{ maxHeight: ROW_HEIGHT * tasks.length + headerStackHeight + 40 + "px" }}
    >
      {/* Label column */}
      <div className="gantt-labels">
        <div className="gantt-label-header" style={{ height: headerStackHeight }}>
          Task
        </div>
        {tasks.map((task) => (
          <div key={task.id} className="gantt-label-row">
            <div
              className="gantt-label-title"
              style={{ color: criticalPathIds.has(task.id) ? "#ef4444" : "white" }}
            >
              {task.title}
              {criticalPathIds.has(task.id) && (
                <span className="text-[9px] border border-red-500/30 text-red-400 px-1 rounded ml-1">
                  CRITICAL PATH
                </span>
              )}
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
          {/* Header axis stack (secondary above primary) */}
          <div
            className="gantt-axis-stack"
            style={{ height: headerStackHeight }}
          >
            {showSecondaryAxis && (
              <div
                className="gantt-axis-secondary"
                style={{ height: HEADER_HEIGHT, width: totalWidth }}
              >
                {secondaryAxis.map((b, i) => (
                  <div
                    key={`sec-${i}`}
                    className="gantt-axis-cell secondary"
                    style={{
                      left: differenceInCalendarDays(new Date(b.startMs), axisStart) * dayWidth,
                      width: b.widthDays * dayWidth,
                    }}
                  >
                    {b.label}
                  </div>
                ))}
              </div>
            )}
            <div
              className="gantt-axis-primary"
              style={{ height: HEADER_HEIGHT, width: totalWidth }}
            >
              {primaryAxis.map((b, i) => (
                <div
                  key={`pri-${i}`}
                  className="gantt-axis-cell primary"
                  style={{
                    left: differenceInCalendarDays(new Date(b.startMs), axisStart) * dayWidth,
                    width: b.widthDays * dayWidth,
                  }}
                >
                  <span className="gantt-axis-label">{b.label}</span>
                  {b.sublabel && (
                    <span className="gantt-axis-sublabel">{b.sublabel}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Rows + overlays */}
          <div ref={rowsRef} className="gantt-rows" style={{ height: tasks.length * ROW_HEIGHT }}>
            {/* Weekend shading (Day zoom only) */}
            {weekendCols.map((w, i) => (
              <div
                key={`wknd-${i}`}
                className="gantt-weekend-col"
                style={{ left: w.left, width: w.width }}
              />
            ))}

            {/* Vertical grid lines aligned to primary axis buckets */}
            {primaryAxis.map((b, i) => (
              <div
                key={`grid-${i}`}
                className="gantt-grid-line"
                style={{
                  left: differenceInCalendarDays(new Date(b.startMs), axisStart) * dayWidth,
                }}
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

            {/* Dependency lines (SVG layer) */}
            <svg
              className="absolute inset-0 pointer-events-none"
              style={{
                width: totalWidth,
                height: tasks.length * ROW_HEIGHT,
                zIndex: 10,
              }}
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
                const predIndex = tasks.findIndex(
                  (t) => t.id === task.predecessor_task_id
                );
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
                const isCriticalDep =
                  criticalPathIds.has(task.id) && criticalPathIds.has(pred.id);
                const midX = x1 + (x2 - x1) / 2;
                const points =
                  x2 > x1 + 10
                    ? `${x1},${y1} ${midX},${y1} ${midX},${y2} ${x2},${y2}`
                    : `${x1},${y1} ${x1 + 10},${y1} ${x1 + 10},${y1 + (y2 - y1) / 2} ${x2 - 10},${y1 + (y2 - y1) / 2} ${x2 - 10},${y2} ${x2},${y2}`;
                return (
                  <polyline
                    key={`dep-${task.id}`}
                    points={points}
                    fill="none"
                    stroke={isCriticalDep ? "#ef4444" : "#60a5fa"}
                    strokeWidth={isCriticalDep ? "2" : "1.5"}
                    strokeDasharray={task.status === "pending" ? "4 2" : "0"}
                    markerEnd={
                      isCriticalDep ? "url(#arrowhead-critical)" : "url(#arrowhead)"
                    }
                    className="opacity-40 hover:opacity-100 transition-opacity"
                  />
                );
              })}
              {/* PR-C: dependency ghost while user is dragging from a bar's
                  dep handle. Stops being rendered as soon as pointer is up. */}
              {depGhost && (
                <line
                  x1={depGhost.x1}
                  y1={depGhost.y1}
                  x2={depGhost.x2}
                  y2={depGhost.y2}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  markerEnd="url(#arrowhead)"
                  className="gantt-dep-ghost"
                />
              )}
            </svg>

            {tasks.map((task, rowIndex) => {
              const start = parseSafe(task.start_date);
              const end = parseSafe(task.end_date);
              const taskDeliverables =
                (deliverablesByTask.get(task.id) as Deliverable[]) ?? [];
              const taskEvidences = allEvidences.get(task.id) ?? [];
              const top = rowIndex * ROW_HEIGHT;
              const isTaskCritical = criticalPathIds.has(task.id);

              const barLeft = start ? toPx(start) : 0;
              const barWidth =
                start && end ? Math.max(6, toPx(end) - toPx(start) + dayWidth) : 0;
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
                  <div
                    className={`gantt-row-bg ${rowIndex % 2 === 0 ? "even" : "odd"}`}
                    style={
                      task.color_hex
                        ? { background: hexToRgba(task.color_hex, 0.08) || undefined }
                        : undefined
                    }
                  />

                  {/* Task bar */}
                  {start && end && (() => {
                    const today = startOfDay(new Date());
                    const isOverdue =
                      end < today && task.status !== "completed";
                    const isDraggingThis = dragGhost?.taskId === task.id;
                    const renderLeft = isDraggingThis ? dragGhost!.left : barLeft;
                    const renderWidth = isDraggingThis ? dragGhost!.width : barWidth;
                    return (
                      <div
                        className={`gantt-bar-shell ${isOverdue ? "gantt-overdue" : ""} ${depHoverTargetId === task.id ? "gantt-dep-target" : ""}`}
                        style={{
                          position: "absolute",
                          left: renderLeft,
                          width: renderWidth,
                          top: BAR_TOP,
                          height: BAR_HEIGHT,
                        }}
                      >
                        <button
                          type="button"
                          data-testid={`gantt-bar-${task.id}`}
                          data-overdue={isOverdue ? "true" : "false"}
                          className={`gantt-bar group ${
                            isTaskCritical
                              ? "ring-2 ring-red-500 ring-offset-2 ring-offset-black/20"
                              : ""
                          }`}
                          style={{
                            position: "absolute",
                            inset: 0,
                            background: task.color_hex || barColor(task.status),
                            border: isTaskCritical ? "1px solid #ef4444" : "none",
                            padding: 0,
                          }}
                          onClick={() => {
                            if (suppressNextClick.current) {
                              suppressNextClick.current = false;
                              return;
                            }
                            onTaskClick?.(task.id);
                          }}
                          title={`${isTaskCritical ? "[CRITICAL PATH] " : ""}${isOverdue ? "[OVERDUE] " : ""}Click to edit: ${task.title} · ${task.progress_percent}%`}
                        >
                          <div
                            className="gantt-bar-progress"
                            style={{ width: `${task.progress_percent}%` }}
                          />
                          <span
                            className="gantt-bar-label"
                            style={{ maxWidth: renderWidth - 16 }}
                          >
                            {task.progress_percent}%
                          </span>
                          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-white/10 transition-opacity" />
                        </button>
                        {canEdit && (
                          <>
                            <div
                              data-testid={`gantt-handle-l-${task.id}`}
                              className="gantt-bar-handle gantt-bar-handle-l"
                              onPointerDown={(ev) => startDrag(ev, task, "resize-l")}
                              onPointerMove={onDragMove}
                              onPointerUp={endDrag}
                              onPointerCancel={endDrag}
                              title="Drag to change start date"
                            />
                            <div
                              data-testid={`gantt-handle-r-${task.id}`}
                              className="gantt-bar-handle gantt-bar-handle-r"
                              onPointerDown={(ev) => startDrag(ev, task, "resize-r")}
                              onPointerMove={onDragMove}
                              onPointerUp={endDrag}
                              onPointerCancel={endDrag}
                              title="Drag to change end date"
                            />
                            <div
                              data-testid={`gantt-handle-mid-${task.id}`}
                              className="gantt-bar-handle gantt-bar-handle-mid"
                              onPointerDown={(ev) => startDrag(ev, task, "move")}
                              onPointerMove={onDragMove}
                              onPointerUp={endDrag}
                              onPointerCancel={endDrag}
                              title="Drag to move task"
                            />
                            {/* PR-C: dependency handle — small dot just past
                                the bar's right edge. Drag onto another bar
                                to create a predecessor link. */}
                            <div
                              data-testid={`gantt-handle-dep-${task.id}`}
                              className="gantt-bar-handle-dep"
                              onPointerDown={(ev) => startDepDrag(ev, task)}
                              onPointerMove={onDepDragMove}
                              onPointerUp={endDepDrag}
                              onPointerCancel={endDepDrag}
                              title="Drag onto another bar to create a dependency"
                            />
                          </>
                        )}
                      </div>
                    );
                  })()}

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
                    const dLeft = toPx(dDate) + dayWidth / 2;
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
                    const eLeft = toPx(eDate) + dayWidth / 2;
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
                          src={withAccessToken(e.url_archivo, accessToken)}
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
