"use client";

import { useBilling, type BillingLimits, type BillingUsage } from "./billing-context";

type Row = {
  label: string;
  current: number;
  limit: number;
  formatter?: (n: number) => string;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function buildRows(usage: BillingUsage, limits: BillingLimits): Row[] {
  return [
    { label: "Proyectos activos", current: usage.active_projects, limit: limits.MaxActiveProjects },
    { label: "Usuarios internos", current: usage.internal_users, limit: limits.MaxInternalUsers },
    { label: "Clientes invitados", current: usage.client_guests, limit: limits.MaxClientGuests },
    { label: "Capturas este mes", current: usage.captures_this_month, limit: limits.MaxCapturesPerMonth },
    { label: "Planos subidos", current: usage.blueprint_files, limit: limits.MaxBlueprintFiles },
    {
      label: "Almacenamiento",
      current: usage.storage_bytes,
      limit: limits.MaxStorageBytes,
      formatter: formatBytes,
    },
  ];
}

function pct(current: number, limit: number): number {
  if (limit <= 0) return 0;
  const p = (current / limit) * 100;
  return Math.min(100, Math.max(0, p));
}

function barColor(p: number): string {
  if (p >= 90) return "bg-red-500";
  if (p >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

export function UsagePanel() {
  const billing = useBilling();
  if (!billing || !billing.usage) return null;
  const rows = buildRows(billing.usage, billing.limits);

  return (
    <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-6 backdrop-blur-xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Uso del plan</div>
          <div className="mt-1 text-lg font-bold tracking-tight text-white/90 capitalize">
            {billing.subscription.plan}
          </div>
        </div>
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">
          {billing.subscription.status}
        </div>
      </div>
      <div className="grid gap-4">
        {rows.map((row) => {
          const unlimited = row.limit === -1;
          const p = unlimited ? 0 : pct(row.current, row.limit);
          const fmt = row.formatter ?? ((n: number) => n.toLocaleString("es-MX"));
          return (
            <div key={row.label}>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-semibold text-white/70">{row.label}</span>
                <span className="font-mono tabular-nums text-white/50">
                  {fmt(row.current)}
                  {" / "}
                  {unlimited ? "∞" : fmt(row.limit)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                {!unlimited && (
                  <div
                    className={`h-full rounded-full transition-all ${barColor(p)}`}
                    style={{ width: `${p}%` }}
                  />
                )}
                {unlimited && <div className="h-full w-full rounded-full bg-blue-500/30" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
