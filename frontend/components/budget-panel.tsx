"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { AlertTriangle, AlertCircle } from "lucide-react";
import { ProgressBar } from "./ui/progress-bar";

type Project = {
  id: string;
  name: string;
  budget_total_cents: number;
  spent_total_cents: number;
};

type Task = {
  id: string;
  title: string;
  budget_cents: number;
  spent_cents: number;
  status: string;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format((value || 0) / 100);
}

export function BudgetPanel({ project, tasks }: { project: Project; tasks: Task[] }) {
  const total = project.budget_total_cents;
  const spent = project.spent_total_cents || 0;
  const remaining = Math.max(0, total - spent);
  const pct = total > 0 ? Math.round((spent / total) * 100) : 0;

  const pieData = [
    { name: "Spent", value: spent },
    { name: "Remaining", value: remaining },
  ];
  const COLORS = [pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "var(--accent-blue)", "rgba(255,255,255,0.05)"];

  return (
    <div className="glass-card p-6 space-y-6 border-white/5">
      {pct > 100 && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle size={15} className="shrink-0" />
          <span><strong>Budget exceeded</strong> — {pct}% of the contracted total has been spent.</span>
        </div>
      )}
      {pct > 80 && pct <= 100 && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          <AlertTriangle size={15} className="shrink-0" />
          <span><strong>Budget warning</strong> — {pct}% spent. Remaining: {money(Math.max(0, total - spent))}.</span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">
            Budget
          </div>
          <div className="text-2xl font-black text-white tracking-tight">{money(spent)}</div>
          <div className="text-xs text-white/40 font-medium">of {money(total)} total</div>
        </div>
        <div style={{ width: 80, height: 80 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={24}
                outerRadius={36}
                dataKey="value"
                strokeWidth={0}
              >
                {pieData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(val: number) => money(val)}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-[11px] font-bold text-white/30 uppercase tracking-widest">
          <span>Execution</span>
          <span className="text-white/60">{pct}%</span>
        </div>
        <ProgressBar value={pct} color={pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "var(--accent-blue)"} />
      </div>

      {tasks.filter((t) => t.budget_cents > 0).length > 0 && (
        <div className="space-y-4 pt-4 border-t border-white/5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">
            By task
          </div>
          <div className="grid gap-3">
            {tasks
              .filter((t) => t.budget_cents > 0)
              .map((task) => {
                const taskPct = Math.round(
                  ((task.spent_cents || 0) / (task.budget_cents || 1)) * 100
                );
                return (
                  <div key={task.id} className="space-y-2">
                    <div className="flex justify-between items-end">
                      <span className="text-xs font-bold text-white/80 tracking-tight truncate">{task.title}</span>
                      <span className="text-[10px] text-white/40 font-mono">
                        {money(task.spent_cents)} / {money(task.budget_cents)}
                      </span>
                    </div>
                    <ProgressBar value={taskPct} size="sm" color={taskPct > 90 ? "#ef4444" : taskPct > 70 ? "#f59e0b" : "var(--accent-blue)"} />
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
