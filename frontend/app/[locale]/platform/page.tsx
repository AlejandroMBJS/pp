"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, LogOut, RefreshCw, ShieldCheck } from "lucide-react";

const STORAGE_KEY = "projectpulse-session";

type Session = {
  access_token: string;
  user: { id: string; tenant_id: string; email: string; full_name: string; role: string };
};

type Overview = {
  total_tenants: number;
  total_users: number;
  active_subs: number;
  trialing_subs: number;
  mrr_cents: number;
  by_plan: Record<string, number>;
};

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  created_at?: string;
  plan: string;
  status: string;
  user_count: number;
  project_count: number;
  evidence_count: number;
};

function fmtMoney(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export default function PlatformPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      router.replace("/login?next=/platform");
      return;
    }
    try {
      const parsed: Session = JSON.parse(raw);
      if (parsed.user.role !== "admin" || parsed.user.tenant_id) {
        setError("Esta sección es solo para operadores de la plataforma.");
        setLoading(false);
        return;
      }
      setSession(parsed);
    } catch {
      router.replace("/login?next=/platform");
    }
  }, [router]);

  useEffect(() => {
    if (!session) return;
    refresh(session.access_token);
  }, [session]);

  async function refresh(token: string) {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, tenantsRes] = await Promise.all([
        fetch("/api/v1/platform/overview", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/v1/platform/tenants", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (overviewRes.status === 403 || tenantsRes.status === 403) {
        setError("Acceso denegado.");
        setLoading(false);
        return;
      }
      if (!overviewRes.ok) throw new Error("Error cargando overview");
      if (!tenantsRes.ok) throw new Error("Error cargando tenants");
      setOverview(await overviewRes.json());
      setTenants((await tenantsRes.json()) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }

  function signOut() {
    window.localStorage.removeItem(STORAGE_KEY);
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      <header className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck size={18} className="text-cyan-400" />
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-cyan-400">
                Platform
              </div>
              <div className="text-sm font-black">Operator Console</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {session && (
              <span className="text-[11px] text-white/50 hidden sm:inline">{session.user.email}</span>
            )}
            <button
              onClick={() => session && refresh(session.access_token)}
              disabled={loading}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={signOut}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold">
            {error}
          </div>
        )}

        {loading && !overview ? (
          <div className="py-20 flex items-center justify-center text-white/40">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : overview ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
              <StatCard label="MRR" value={fmtMoney(overview.mrr_cents)} accent="cyan" />
              <StatCard label="Tenants" value={String(overview.total_tenants)} />
              <StatCard label="Users" value={String(overview.total_users)} />
              <StatCard label="Active subs" value={String(overview.active_subs)} accent="emerald" />
              <StatCard label="Trialing" value={String(overview.trialing_subs)} accent="amber" />
            </div>

            <div className="mb-10">
              <h2 className="text-xs uppercase tracking-widest font-bold text-white/50 mb-3">
                Por plan
              </h2>
              <div className="flex flex-wrap gap-2">
                {Object.entries(overview.by_plan).map(([plan, count]) => (
                  <div
                    key={plan}
                    className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs"
                  >
                    <span className="font-bold capitalize">{plan}</span>
                    <span className="text-white/40 ml-2">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-xs uppercase tracking-widest font-bold text-white/50 mb-3">
                Tenants ({tenants.length})
              </h2>
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full text-xs">
                  <thead className="bg-white/[0.02] text-white/50 uppercase tracking-widest text-[10px]">
                    <tr>
                      <th className="text-left px-4 py-3 font-bold">Tenant</th>
                      <th className="text-left px-4 py-3 font-bold">Slug</th>
                      <th className="text-left px-4 py-3 font-bold">Plan</th>
                      <th className="text-left px-4 py-3 font-bold">Status</th>
                      <th className="text-right px-4 py-3 font-bold">Users</th>
                      <th className="text-right px-4 py-3 font-bold">Projects</th>
                      <th className="text-right px-4 py-3 font-bold">Evidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {tenants.map((t) => (
                      <tr key={t.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-bold">{t.name}</td>
                        <td className="px-4 py-3 text-white/40">{t.slug}</td>
                        <td className="px-4 py-3 capitalize">{t.plan}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                              t.status === "active"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : t.status === "trialing"
                                  ? "bg-amber-500/10 text-amber-400"
                                  : "bg-white/5 text-white/40"
                            }`}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-white/70">{t.user_count}</td>
                        <td className="px-4 py-3 text-right text-white/70">{t.project_count}</td>
                        <td className="px-4 py-3 text-right text-white/70">{t.evidence_count}</td>
                      </tr>
                    ))}
                    {tenants.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-white/40">
                          Sin tenants todavía
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-10">
              <Link href="/app" className="text-xs text-white/50 hover:text-white">
                ← Volver al panel estándar
              </Link>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "cyan" | "emerald" | "amber";
}) {
  const color =
    accent === "cyan"
      ? "text-cyan-400"
      : accent === "emerald"
        ? "text-emerald-400"
        : accent === "amber"
          ? "text-amber-400"
          : "text-white";
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="text-[10px] uppercase tracking-widest font-bold text-white/40 mb-2">
        {label}
      </div>
      <div className={`text-2xl font-black ${color}`}>{value}</div>
    </div>
  );
}
