"use client";

import { motion } from "framer-motion";

type DemoPayload = {
  product: string;
  message: string;
  demo_accounts: Array<{
    role: string;
    email: string;
    password: string;
  }>;
  suggested_flow: string[];
};

type DashboardPayload = {
  product_name: string;
  portfolio: {
    active_projects: number;
    open_alerts: number;
    health_score: number;
    budget_variance: string;
  };
  projects: Array<{
    id: string;
    name: string;
    status: string;
    timeline_progress: number;
    budget_consumed: number;
    quality_score: number;
    deliverables_due: number;
  }>;
};

export function Dashboard({ demo, dashboard }: { demo: DemoPayload; dashboard: DashboardPayload }) {
  return (
    <div className="shell">
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="glass rounded-[32px] p-8"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-white/40">ProjectPulse</p>
            <h1 className="mt-2 text-4xl font-semibold text-white md:text-6xl">
              CRM, budget, timeline, deliverables, and quality control.
            </h1>
          </div>
          <div className="max-w-sm text-sm text-white/60 leading-relaxed">{demo.message}</div>
        </div>
      </motion.section>

      <section className="mt-8 grid gap-4 md:grid-cols-4">
        {[
          ["Active projects", dashboard.portfolio.active_projects],
          ["Open alerts", dashboard.portfolio.open_alerts],
          ["Health score", `${dashboard.portfolio.health_score.toFixed(1)}%`],
          ["Variance", dashboard.portfolio.budget_variance],
        ].map(([label, value], index) => (
          <motion.div
            key={String(label)}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + index * 0.08 }}
            className="glass rounded-[24px] p-6 border border-white/5 hover:border-white/10 transition-colors"
          >
            <p className="text-sm text-white/40 font-medium">{label}</p>
            <p className="mt-3 text-3xl font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">{value}</p>
          </motion.div>
        ))}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="glass rounded-[28px] p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-white/90">Demo portfolio</h2>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs uppercase tracking-[0.25em] text-emerald-400 font-bold">
              Live Seed
            </span>
          </div>
          <div className="mt-5 space-y-4">
            {dashboard.projects.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + index * 0.08 }}
                className="rounded-[22px] border border-white/5 bg-white/[0.03] p-5 hover:bg-white/[0.05] transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold text-white">{project.name}</h3>
                    <p className="text-sm text-white/40">Status: {project.status}</p>
                  </div>
                  <div className="text-right text-sm text-white/40 font-medium">
                    Pending deliverables
                    <div className="text-2xl font-bold text-white">{project.deliverables_due}</div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <Metric label="Timeline" value={project.timeline_progress} />
                  <Metric label="Budget" value={project.budget_consumed} />
                  <Metric label="AI Quality" value={project.quality_score} />
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass rounded-[28px] p-6">
            <h2 className="text-2xl font-semibold text-white/90">Demo credentials</h2>
            <div className="mt-4 space-y-3">
              {demo.demo_accounts.map((account) => (
                <div key={account.role} className="rounded-[20px] border border-white/5 bg-white/[0.02] p-4">
                  <div className="text-xs uppercase tracking-[0.25em] text-white/30 font-bold">{account.role}</div>
                  <div className="mt-2 text-sm font-bold text-white/90">{account.email}</div>
                  <div className="text-sm text-white/40 font-mono">{account.password}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-[28px] p-6">
            <h2 className="text-2xl font-semibold text-white/90">Operational workflow</h2>
            <div className="mt-4 space-y-3">
              {demo.suggested_flow.map((step, index) => (
                <div key={step} className="rounded-[20px] border border-white/5 bg-white/[0.02] p-4 text-sm text-white/70 flex items-start gap-4">
                  <span className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/20 border border-blue-500/30 text-[10px] font-bold text-blue-400">
                    {index + 1}
                  </span>
                  {step}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[18px] bg-white/[0.03] border border-white/5 px-4 py-4 text-white hover:bg-white/[0.06] transition-colors">
      <p className="text-[10px] uppercase font-bold tracking-[0.2em] text-white/30">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}%</p>
    </div>
  );
}
