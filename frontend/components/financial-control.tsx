"use client";

import React, { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Pencil,
  PieChart,
  Plus,
  Receipt,
  Tag,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

type Expense = {
  id: string;
  title: string;
  amount_cents: number;
  category: string;
  vendor: string;
  status: string;
  date: string;
};

type BudgetAdjustment = {
  id: string;
  amount_cents: number;
  reason: string;
  date: string;
};

type Project = {
  id: string;
  name: string;
  budget_total_cents: number;
  spent_total_cents: number;
};

type FinancialControlProps = {
  project: Project;
  session: any;
  tasks: any[];
};

const defaultExpenseForm = {
  id: "",
  title: "",
  amount_mxn: "",
  category: "material",
  vendor: "",
  status: "approved",
  date: new Date().toISOString().slice(0, 10),
};

export function FinancialControl({ project, session, tasks }: FinancialControlProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [adjustments, setAdjustments] = useState<BudgetAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState(defaultExpenseForm);
  const [showAdjForm, setShowAdjForm] = useState(false);
  const [adjForm, setAdjForm] = useState({ amount_mxn: "", reason: "", date: new Date().toISOString().slice(0, 10) });
  const [submittingAdj, setSubmittingAdj] = useState(false);

  useEffect(() => {
    void fetchExpenses();
    void fetchAdjustments();
  }, [project.id]);

  async function fetchAdjustments() {
    try {
      const res = await fetch(`/api/v1/projects/${project.id}/budget-adjustments`, {
        headers: { Authorization: `Bearer ${session?.access_token || ""}` },
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setAdjustments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      toast.error("No se pudieron cargar los ajustes de presupuesto.");
      setAdjustments([]);
    }
  }

  async function fetchExpenses() {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/projects/${project.id}/expenses`, {
        headers: { Authorization: `Bearer ${session?.access_token || ""}` },
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setExpenses(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      toast.error("Could not load project expenses.");
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(expenseForm.amount_mxn);
    if (!expenseForm.title.trim() || !expenseForm.vendor.trim() || !expenseForm.date || amount <= 0) {
      toast.error("Complete title, vendor, date, and a valid amount.");
      return;
    }

    setSubmitting(true);
    try {
      const endpoint = expenseForm.id ? `/api/v1/expenses/${expenseForm.id}` : `/api/v1/projects/${project.id}/expenses`;
      const res = await fetch(endpoint, {
        method: expenseForm.id ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          title: expenseForm.title.trim(),
          amount_cents: Math.round(amount * 100),
          category: expenseForm.category,
          vendor: expenseForm.vendor.trim(),
          status: expenseForm.status,
          date: expenseForm.date,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);

      setExpenseForm(defaultExpenseForm);
      setShowForm(false);
      toast.success(expenseForm.id ? "Expense updated." : "Expense created.");
      await fetchExpenses();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not save the expense.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(adjForm.amount_mxn);
    if (!adjForm.reason.trim() || !adjForm.date || amount === 0) {
      toast.error("Complete reason, date, and a non-zero amount.");
      return;
    }
    setSubmittingAdj(true);
    try {
      const res = await fetch(`/api/v1/projects/${project.id}/budget-adjustments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          amount_cents: Math.round(amount * 100),
          reason: adjForm.reason.trim(),
          date: adjForm.date,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);
      setAdjForm({ amount_mxn: "", reason: "", date: new Date().toISOString().slice(0, 10) });
      setShowAdjForm(false);
      toast.success("Budget adjustment created.");
      await fetchAdjustments();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not save the adjustment.");
    } finally {
      setSubmittingAdj(false);
    }
  }

  async function handleDeleteExpense(expenseId: string) {
    if (!confirm("Delete this expense?")) return;
    setDeletingId(expenseId);
    try {
      const res = await fetch(`/api/v1/expenses/${expenseId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token || ""}` },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);
      toast.success("Expense deleted.");
      await fetchExpenses();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not delete the expense.");
    } finally {
      setDeletingId(null);
    }
  }

  const formatMoney = (cents: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(cents / 100);

  const spentFromExpenses = useMemo(
    () => expenses.reduce((sum, expense) => sum + expense.amount_cents, 0),
    [expenses]
  );

  const totalAdjustmentsCents = useMemo(
    () => adjustments.reduce((sum, adj) => sum + adj.amount_cents, 0),
    [adjustments]
  );

  const totalBudgetWithAdjustments = (project.budget_total_cents || 0) + totalAdjustmentsCents;
  const totalSpentCents = Math.max(project.spent_total_cents || 0, spentFromExpenses);
  const remainingCents = Math.max(totalBudgetWithAdjustments - totalSpentCents, 0);
  
  // FAC Logic: Forecast at Completion
  const { physicalProgress, forecastAtCompletion, healthStatus } = useMemo(() => {
    if (!tasks || tasks.length === 0) return { physicalProgress: 0, forecastAtCompletion: totalBudgetWithAdjustments, healthStatus: "neutral" };
    
    const totalWeight = tasks.reduce((sum: number, t: any) => sum + (t.budget_cents || 1000), 0);
    const weightedProgress = tasks.reduce((sum: number, t: any) => sum + (t.progress_percent * (t.budget_cents || 1000)), 0);
    const physProg = weightedProgress / totalWeight; // physical completion %

    let fac = totalBudgetWithAdjustments;
    if (physProg > 5 && totalSpentCents > 0) {
      fac = totalSpentCents / (physProg / 100);
    }

    const variance = totalBudgetWithAdjustments - fac;
    let status = "healthy";
    if (variance < -5000000) status = "critical"; // > $50k overrun
    else if (variance < 0) status = "warning";

    return { physicalProgress: physProg, forecastAtCompletion: fac, healthStatus: status };
  }, [tasks, totalSpentCents, totalBudgetWithAdjustments]);

  const spentPercent = totalBudgetWithAdjustments > 0
    ? (totalSpentCents / totalBudgetWithAdjustments) * 100
    : physicalProgress;

  const categoryColors: Record<string, string> = {
    material: "#3b82f6",
    labor: "#0ea5e9",
    equipment: "#f59e0b",
    misc: "#94a3b8",
  };

  const categoryBreakdown = useMemo(() => {
    if (spentFromExpenses === 0) return [];
    const labels: Record<string, string> = {
      material: "Materials",
      labor: "Labor",
      equipment: "Equipment",
      misc: "Miscellaneous",
    };
    const totals = new Map<string, number>();
    for (const expense of expenses) {
      totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount_cents);
    }
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([category, cents]) => ({
        category,
        label: labels[category] ?? category,
        cents,
        percent: spentFromExpenses > 0 ? (cents / spentFromExpenses) * 100 : 0,
      }));
  }, [expenses, spentFromExpenses]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-card p-6 border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/20">
              <DollarSign className="text-blue-400" size={20} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">Budget (+ Adjustments)</div>
              <div className="text-2xl font-black text-white tracking-tight">{formatMoney(totalBudgetWithAdjustments)}</div>
            </div>
          </div>
          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-1000"
              style={{ width: `${Math.min(spentPercent, 100)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between items-center text-[10px] font-medium uppercase tracking-wider">
             <span className="text-white/40">Spent: {spentPercent.toFixed(1)}%</span>
             <span className="text-white/40">Remaining: {formatMoney(remainingCents)}</span>
          </div>
        </div>

        <div className="glass-card p-6 border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-slate-500/20 flex items-center justify-center border border-slate-500/20">
              <Receipt className="text-slate-400" size={20} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">Actual Spend</div>
              <div className="text-2xl font-black text-white tracking-tight">{formatMoney(totalSpentCents)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/30">
              {expenses.length} Transactions
          </div>
        </div>

        {/* Forecast Card */}
        <div className={`glass-card p-6 border-white/5 bg-white/[0.02] ${
          healthStatus === "critical" ? "border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.05)]" :
          healthStatus === "warning" ? "border-amber-500/40" : ""
        }`}>
          <div className="flex items-center gap-3 mb-4">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${
              healthStatus === "critical" ? "bg-red-500/20 border-red-500/20" :
              healthStatus === "warning" ? "bg-amber-500/20 border-amber-500/20" :
              "bg-emerald-500/20 border-emerald-500/20"
            }`}>
              <TrendingUp className={
                healthStatus === "critical" ? "text-red-400" :
                healthStatus === "warning" ? "text-amber-400" :
                "text-emerald-400"
              } size={20} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">Forecast (FAC)</div>
              <div className={`text-2xl font-black tracking-tight ${
                healthStatus === "critical" ? "text-red-400" :
                healthStatus === "warning" ? "text-amber-400" :
                "text-white"
              }`}>{formatMoney(forecastAtCompletion)}</div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Physical Progress</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-white/60">{physicalProgress.toFixed(1)}%</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowForm((current) => !current)}
          className="glass-card p-6 border-white/5 bg-white/[0.02] flex items-center justify-center group cursor-pointer hover:bg-white/[0.04] transition-all border-dashed border-white/10"
        >
          <div className="text-center">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform">
              <Plus className="text-white/40" size={24} />
            </div>
            <div className="mt-3 text-[10px] font-black text-white/60 uppercase tracking-widest">
              {showForm ? "Hide form" : "New Expense"}
            </div>
          </div>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreateExpense} className="glass-card p-6 border-white/5 bg-white/[0.02] space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Receipt className="text-white/50" size={18} />
            </div>
            <div>
               <div className="text-sm font-black text-white uppercase tracking-widest">Register expense</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/25">{project.name}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Concept</span>
              <input
                value={expenseForm.title}
                onChange={(event) => setExpenseForm((current) => ({ ...current, title: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-blue-500/40"
                placeholder="Steel purchase"
              />
            </label>

            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Amount (MXN)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={expenseForm.amount_mxn}
                onChange={(event) => setExpenseForm((current) => ({ ...current, amount_mxn: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-blue-500/40"
                placeholder="12500"
              />
            </label>

            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Vendor</span>
              <input
                value={expenseForm.vendor}
                onChange={(event) => setExpenseForm((current) => ({ ...current, vendor: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-blue-500/40"
                placeholder="North Steel Co."
              />
            </label>

            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Category</span>
              <select
                value={expenseForm.category}
                onChange={(event) => setExpenseForm((current) => ({ ...current, category: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-[#0f172a] px-4 py-3 text-sm text-white outline-none focus:border-blue-500/40"
              >
                <option value="material">Material</option>
                <option value="labor">Labor</option>
                <option value="equipment">Equipment</option>
                <option value="misc">Misc</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Status</span>
              <select
                value={expenseForm.status}
                onChange={(event) => setExpenseForm((current) => ({ ...current, status: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-[#0f172a] px-4 py-3 text-sm text-white outline-none focus:border-blue-500/40"
              >
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="disputed">Disputed</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Date</span>
              <input
                type="date"
                value={expenseForm.date}
                onChange={(event) => setExpenseForm((current) => ({ ...current, date: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-blue-500/40"
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-2xl border border-white/10 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white/60 transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-2xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Saving..." : expenseForm.id ? "Update expense" : "Save expense"}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 text-white">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white/40">Transaction History</h2>
            <div className="flex items-center gap-4 text-[10px] font-bold text-white/30">
              <span className="flex items-center gap-1.5"><Calendar size={12} /> {new Date().toLocaleDateString("es-MX")}</span>
              <span className="flex items-center gap-1.5"><Tag size={12} /> {project.name}</span>
            </div>
          </div>

          <div className="space-y-2">
            {expenses.map((expense) => (
              <div key={expense.id} className="inspector-action-btn w-full group">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-4">
                    <div
                      className="h-12 w-12 rounded-2xl flex items-center justify-center border border-white/5 shadow-inner"
                      style={{ background: `${categoryColors[expense.category] || "#94a3b8"}15` }}
                    >
                      <Receipt className="text-white/30" size={20} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white tracking-tight">{expense.title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] uppercase font-black tracking-widest text-white/20">{expense.vendor}</span>
                        <span className="h-1 w-1 rounded-full bg-white/10" />
                        <span className="text-[10px] uppercase font-black tracking-widest text-white/20">{expense.date}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black tracking-tighter">{formatMoney(expense.amount_cents)}</div>
                    <div className="flex items-center justify-end gap-1.5 mt-0.5">
                      {expense.status === "approved" ? (
                        <CheckCircle2 size={12} className="text-emerald-500" />
                      ) : (
                        <Clock size={12} className="text-amber-500" />
                      )}
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{expense.status}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setExpenseForm({
                            id: expense.id,
                            title: expense.title,
                            amount_mxn: String(expense.amount_cents / 100),
                            category: expense.category,
                            vendor: expense.vendor,
                            status: expense.status,
                            date: expense.date,
                          });
                          setShowForm(true);
                        }}
                        className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/40 hover:text-white/70"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteExpense(expense.id)}
                        disabled={deletingId === expense.id}
                        className="rounded-lg border border-red-500/20 bg-red-500/[0.08] p-2 text-red-300/60 hover:text-red-200 disabled:opacity-40"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {expenses.length === 0 && !loading && (
              <div className="py-20 text-center glass-card border-dashed border-white/10">
                <AlertCircle className="mx-auto text-white/10 mb-4" size={48} />
                <div className="text-sm font-bold text-white/20 uppercase tracking-[0.2em]">No transactions recorded</div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="px-2">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white/40">Cost Analytics</h2>
          </div>

          <div className="glass-card p-6 border-white/5 bg-white/[0.02] space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-white/40">Categorization</span>
                <PieChart size={16} className="text-white/20" />
              </div>

              {categoryBreakdown.length > 0 ? (
                <div className="space-y-3">
                  {categoryBreakdown.map((category) => (
                    <div key={category.category} className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                        <span className="text-white/40">{category.label}</span>
                        <span className="text-white/60">{category.percent.toFixed(0)}%</span>
                      </div>
                      <div className="h-1 w-full bg-white/5 rounded-full">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${category.percent}%`,
                            backgroundColor: categoryColors[category.category] ?? "#94a3b8",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-[10px] font-black uppercase tracking-[0.2em] text-white/20">
                  Not enough data
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-white/5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <Building2 className="text-white/40" size={18} />
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-white/25">Latest cycle</div>
                  <div className="text-sm font-bold text-white/70">{expenses[0]?.vendor ?? "No recent vendor"}</div>
                </div>
              </div>

              {/* Budget Adjustments (Change Orders) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Change Orders</div>
                  <button
                    type="button"
                    onClick={() => setShowAdjForm((v) => !v)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 transition-all"
                  >
                    <Plus size={10} /> New
                  </button>
                </div>
                {showAdjForm && (
                  <form onSubmit={handleCreateAdjustment} className="space-y-2 p-3 rounded-xl bg-white/[0.03] border border-white/10">
                    <input
                      type="text"
                      placeholder="Reason / description"
                      value={adjForm.reason}
                      onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        placeholder="Amount MXN (neg=deduct)"
                        value={adjForm.amount_mxn}
                        onChange={(e) => setAdjForm({ ...adjForm, amount_mxn: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-blue-500/50 font-mono"
                      />
                      <input
                        type="date"
                        value={adjForm.date}
                        onChange={(e) => setAdjForm({ ...adjForm, date: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={submittingAdj}
                        className="flex-1 py-2 rounded-lg bg-blue-600/80 hover:bg-blue-500 text-[10px] font-black uppercase tracking-wider text-white disabled:opacity-50 transition-all"
                      >
                        {submittingAdj ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAdjForm(false)}
                        className="px-3 py-2 rounded-lg bg-white/5 text-[10px] font-black text-white/40 hover:text-white/70 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
                <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                  {adjustments.map(adj => (
                    <div key={adj.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] font-bold text-white/80 uppercase truncate max-w-[120px]">{adj.reason}</span>
                        <span className={`text-[10px] font-black ${adj.amount_cents >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {adj.amount_cents >= 0 ? "+" : ""}{formatMoney(adj.amount_cents)}
                        </span>
                      </div>
                      <div className="text-[8px] font-black text-white/20 uppercase tracking-tighter">{adj.date}</div>
                    </div>
                  ))}
                  {adjustments.length === 0 && (
                     <div className="text-[8px] font-bold text-white/10 uppercase italic">No adjustments registered</div>
                  )}
                </div>
              </div>

              <button
                className="w-full py-4 rounded-2xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-[0.2em] text-white/60 hover:bg-white/10 transition-all active:scale-95 opacity-40 cursor-not-allowed"
                disabled
                title="Próximamente"
              >
                Generate PDF Report (Próximamente)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
