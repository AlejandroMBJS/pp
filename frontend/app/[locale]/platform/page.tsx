"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Ban,
  CreditCard,
  Loader2,
  LogOut,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  UserCog,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";

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

type ModalKind = null | "suspend" | "reactivate" | "billing";

const PLAN_CHOICES = ["starter", "professional", "business", "enterprise"] as const;
const STATUS_CHOICES = ["trialing", "active", "past_due", "canceled", "read_only"] as const;

function fmtMoney(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export default function PlatformPage() {
  const router = useRouter();
  const t = useTranslations("platform");
  const [session, setSession] = useState<Session | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [activeTenant, setActiveTenant] = useState<TenantRow | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [busy, setBusy] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

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
        setError(t("errors.notOperator"));
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
        setError(t("errors.denied"));
        setLoading(false);
        return;
      }
      if (!overviewRes.ok) throw new Error(t("errors.loadOverview"));
      if (!tenantsRes.ok) throw new Error(t("errors.loadTenants"));
      setOverview(await overviewRes.json());
      setTenants((await tenantsRes.json()) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  function signOut() {
    window.localStorage.removeItem(STORAGE_KEY);
    router.replace("/login");
  }

  function openModal(tenant: TenantRow, kind: Exclude<ModalKind, null>) {
    setActiveTenant(tenant);
    setModal(kind);
    setError(null);
    setNotice(null);
  }

  function closeModal() {
    if (busy) return;
    setModal(null);
    setActiveTenant(null);
  }

  async function callAdmin(
    path: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    if (!session) throw new Error("no session");
    const res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data?.error === "string" ? data.error : `HTTP ${res.status}`,
      );
    }
    return data ?? {};
  }

  async function handleImpersonate(tenant: TenantRow) {
    if (!session) return;
    if (!window.confirm(t("actions.impersonateConfirm", { name: tenant.name }))) return;
    setImpersonatingId(tenant.id);
    setError(null);
    try {
      const data = await callAdmin(`/api/v1/platform/tenants/${tenant.id}/impersonate`);
      const token = data.access_token as string | undefined;
      const user = data.user as Session["user"] | undefined;
      if (!token || !user) throw new Error(t("errors.generic"));
      const impersonationSession: Session = { access_token: token, user };
      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(impersonationSession))));
      setNotice(t("actions.impersonateOpened", { name: tenant.name }));
      window.open(`/app#imp=${encoded}`, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setImpersonatingId(null);
    }
  }

  async function handleSuspend(reason: string) {
    if (!activeTenant) return;
    setBusy(true);
    setError(null);
    try {
      await callAdmin(`/api/v1/platform/tenants/${activeTenant.id}/suspend`, { reason });
      setNotice(t("actions.suspendDone", { name: activeTenant.name }));
      setModal(null);
      setActiveTenant(null);
      if (session) await refresh(session.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function handleReactivate() {
    if (!activeTenant) return;
    setBusy(true);
    setError(null);
    try {
      await callAdmin(`/api/v1/platform/tenants/${activeTenant.id}/reactivate`);
      setNotice(t("actions.reactivateDone", { name: activeTenant.name }));
      setModal(null);
      setActiveTenant(null);
      if (session) await refresh(session.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function handleExtendTrial(days: number) {
    if (!activeTenant) return;
    setBusy(true);
    setError(null);
    try {
      await callAdmin(`/api/v1/platform/tenants/${activeTenant.id}/billing/extend-trial`, {
        days,
      });
      setNotice(t("actions.extendTrialDone", { days, name: activeTenant.name }));
      if (session) await refresh(session.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function handleCompPlan(plan: string) {
    if (!activeTenant) return;
    setBusy(true);
    setError(null);
    try {
      await callAdmin(`/api/v1/platform/tenants/${activeTenant.id}/billing/comp-plan`, {
        plan,
      });
      setNotice(t("actions.compPlanDone", { plan, name: activeTenant.name }));
      if (session) await refresh(session.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function handleOverrideStatus(status: string) {
    if (!activeTenant) return;
    setBusy(true);
    setError(null);
    try {
      await callAdmin(`/api/v1/platform/tenants/${activeTenant.id}/billing/override-status`, {
        status,
      });
      setNotice(t("actions.overrideStatusDone", { status, name: activeTenant.name }));
      if (session) await refresh(session.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      <header className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck size={18} className="text-cyan-400" />
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-cyan-400">
                {t("eyebrow")}
              </div>
              <div className="text-sm font-black">{t("title")}</div>
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
        {notice && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold flex items-center justify-between gap-3">
            <span>{notice}</span>
            <button
              onClick={() => setNotice(null)}
              className="text-emerald-400/70 hover:text-emerald-400"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {loading && !overview ? (
          <div className="py-20 flex items-center justify-center text-white/40">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : overview ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
              <StatCard label={t("stats.mrr")} value={fmtMoney(overview.mrr_cents)} accent="cyan" />
              <StatCard label={t("stats.tenants")} value={String(overview.total_tenants)} />
              <StatCard label={t("stats.users")} value={String(overview.total_users)} />
              <StatCard label={t("stats.activeSubs")} value={String(overview.active_subs)} accent="emerald" />
              <StatCard label={t("stats.trialing")} value={String(overview.trialing_subs)} accent="amber" />
            </div>

            <div className="mb-10">
              <h2 className="text-xs uppercase tracking-widest font-bold text-white/50 mb-3">
                {t("byPlan")}
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
                {t("tenantsCount", { count: tenants.length })}
              </h2>
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full text-xs">
                  <thead className="bg-white/[0.02] text-white/50 uppercase tracking-widest text-[10px]">
                    <tr>
                      <th className="text-left px-4 py-3 font-bold">{t("table.tenant")}</th>
                      <th className="text-left px-4 py-3 font-bold">{t("table.slug")}</th>
                      <th className="text-left px-4 py-3 font-bold">{t("table.plan")}</th>
                      <th className="text-left px-4 py-3 font-bold">{t("table.status")}</th>
                      <th className="text-right px-4 py-3 font-bold">{t("table.users")}</th>
                      <th className="text-right px-4 py-3 font-bold">{t("table.projects")}</th>
                      <th className="text-right px-4 py-3 font-bold">{t("table.evidence")}</th>
                      <th className="text-right px-4 py-3 font-bold">{t("table.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {tenants.map((tenant) => {
                      const suspended = tenant.status === "suspended";
                      return (
                        <tr key={tenant.id} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-3 font-bold">{tenant.name}</td>
                          <td className="px-4 py-3 text-white/40">{tenant.slug}</td>
                          <td className="px-4 py-3 capitalize">{tenant.plan}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                                tenant.status === "active"
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : tenant.status === "trialing"
                                    ? "bg-amber-500/10 text-amber-400"
                                    : tenant.status === "suspended"
                                      ? "bg-red-500/10 text-red-400"
                                      : "bg-white/5 text-white/40"
                              }`}
                            >
                              {tenant.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-white/70">{tenant.user_count}</td>
                          <td className="px-4 py-3 text-right text-white/70">{tenant.project_count}</td>
                          <td className="px-4 py-3 text-right text-white/70">{tenant.evidence_count}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <IconButton
                                title={t("actions.impersonate")}
                                onClick={() => handleImpersonate(tenant)}
                                disabled={impersonatingId === tenant.id}
                              >
                                {impersonatingId === tenant.id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <UserCog size={12} />
                                )}
                              </IconButton>
                              {suspended ? (
                                <IconButton
                                  title={t("actions.reactivate")}
                                  onClick={() => openModal(tenant, "reactivate")}
                                  tone="emerald"
                                >
                                  <PlayCircle size={12} />
                                </IconButton>
                              ) : (
                                <IconButton
                                  title={t("actions.suspend")}
                                  onClick={() => openModal(tenant, "suspend")}
                                  tone="red"
                                >
                                  <Ban size={12} />
                                </IconButton>
                              )}
                              <IconButton
                                title={t("actions.billing")}
                                onClick={() => openModal(tenant, "billing")}
                                tone="cyan"
                              >
                                <CreditCard size={12} />
                              </IconButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {tenants.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-white/40">
                          {t("table.empty")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-10">
              <Link href="/app" className="text-xs text-white/50 hover:text-white">
                {t("backToApp")}
              </Link>
            </div>
          </>
        ) : null}
      </main>

      {modal === "suspend" && activeTenant && (
        <SuspendModal
          tenant={activeTenant}
          busy={busy}
          onClose={closeModal}
          onSubmit={handleSuspend}
          t={t}
        />
      )}
      {modal === "reactivate" && activeTenant && (
        <ReactivateModal
          tenant={activeTenant}
          busy={busy}
          onClose={closeModal}
          onConfirm={handleReactivate}
          t={t}
        />
      )}
      {modal === "billing" && activeTenant && (
        <BillingModal
          tenant={activeTenant}
          busy={busy}
          onClose={closeModal}
          onExtendTrial={handleExtendTrial}
          onCompPlan={handleCompPlan}
          onOverrideStatus={handleOverrideStatus}
          t={t}
        />
      )}
    </div>
  );
}

function IconButton({
  children,
  onClick,
  title,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  tone?: "red" | "emerald" | "cyan";
}) {
  const toneClass =
    tone === "red"
      ? "hover:bg-red-500/10 hover:text-red-400"
      : tone === "emerald"
        ? "hover:bg-emerald-500/10 hover:text-emerald-400"
        : tone === "cyan"
          ? "hover:bg-cyan-500/10 hover:text-cyan-400"
          : "hover:bg-white/10";
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded-lg bg-white/5 text-white/70 transition disabled:opacity-50 disabled:cursor-not-allowed ${toneClass}`}
    >
      {children}
    </button>
  );
}

function ModalShell({
  title,
  onClose,
  children,
  busy,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  busy?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0f1524] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="text-sm font-black">{title}</div>
          <button
            onClick={onClose}
            disabled={busy}
            className="p-1.5 rounded-lg text-white/60 hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function SuspendModal({
  tenant,
  busy,
  onClose,
  onSubmit,
  t,
}: {
  tenant: TenantRow;
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  t: ReturnType<typeof useTranslations<"platform">>;
}) {
  const [reason, setReason] = useState("");
  return (
    <ModalShell title={t("suspendModal.title", { name: tenant.name })} onClose={onClose} busy={busy}>
      <p className="text-xs text-white/60 mb-4">{t("suspendModal.description")}</p>
      <label className="block text-[10px] uppercase tracking-widest font-bold text-white/50 mb-2">
        {t("suspendModal.reasonLabel")}
      </label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, 500))}
        placeholder={t("suspendModal.reasonPlaceholder")}
        rows={3}
        className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/30 resize-none"
      />
      <div className="mt-6 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-xs font-bold disabled:opacity-50"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={() => onSubmit(reason.trim())}
          disabled={busy}
          className="px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-bold disabled:opacity-50 flex items-center gap-2"
        >
          {busy && <Loader2 size={12} className="animate-spin" />}
          {t("suspendModal.confirm")}
        </button>
      </div>
    </ModalShell>
  );
}

function ReactivateModal({
  tenant,
  busy,
  onClose,
  onConfirm,
  t,
}: {
  tenant: TenantRow;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  t: ReturnType<typeof useTranslations<"platform">>;
}) {
  return (
    <ModalShell
      title={t("reactivateModal.title", { name: tenant.name })}
      onClose={onClose}
      busy={busy}
    >
      <p className="text-xs text-white/60 mb-6">{t("reactivateModal.description")}</p>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-xs font-bold disabled:opacity-50"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-bold disabled:opacity-50 flex items-center gap-2"
        >
          {busy && <Loader2 size={12} className="animate-spin" />}
          {t("reactivateModal.confirm")}
        </button>
      </div>
    </ModalShell>
  );
}

function BillingModal({
  tenant,
  busy,
  onClose,
  onExtendTrial,
  onCompPlan,
  onOverrideStatus,
  t,
}: {
  tenant: TenantRow;
  busy: boolean;
  onClose: () => void;
  onExtendTrial: (days: number) => void;
  onCompPlan: (plan: string) => void;
  onOverrideStatus: (status: string) => void;
  t: ReturnType<typeof useTranslations<"platform">>;
}) {
  const [days, setDays] = useState(14);
  const [plan, setPlan] = useState(tenant.plan || "starter");
  const [status, setStatus] = useState(tenant.status || "active");

  return (
    <ModalShell title={t("billingModal.title", { name: tenant.name })} onClose={onClose} busy={busy}>
      <div className="space-y-6">
        <section>
          <div className="text-[10px] uppercase tracking-widest font-bold text-white/50 mb-2">
            {t("billingModal.extendTrial")}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) =>
                setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))
              }
              disabled={busy}
              className="w-24 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-white/30"
            />
            <span className="text-xs text-white/50">{t("billingModal.days")}</span>
            <button
              type="button"
              onClick={() => onExtendTrial(days)}
              disabled={busy || days < 1 || days > 365}
              className="ml-auto px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-bold disabled:opacity-50 flex items-center gap-2"
            >
              {busy && <Loader2 size={12} className="animate-spin" />}
              {t("billingModal.apply")}
            </button>
          </div>
        </section>

        <section>
          <div className="text-[10px] uppercase tracking-widest font-bold text-white/50 mb-2">
            {t("billingModal.compPlan")}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              disabled={busy}
              className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-white/30"
            >
              {PLAN_CHOICES.map((p) => (
                <option key={p} value={p} className="bg-[#0f1524] text-white">
                  {p}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onCompPlan(plan)}
              disabled={busy}
              className="ml-auto px-3 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 text-xs font-bold disabled:opacity-50 flex items-center gap-2"
            >
              {busy && <Loader2 size={12} className="animate-spin" />}
              {t("billingModal.apply")}
            </button>
          </div>
        </section>

        <section>
          <div className="text-[10px] uppercase tracking-widest font-bold text-white/50 mb-2">
            {t("billingModal.overrideStatus")}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={busy}
              className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-white/30"
            >
              {STATUS_CHOICES.map((s) => (
                <option key={s} value={s} className="bg-[#0f1524] text-white">
                  {s}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onOverrideStatus(status)}
              disabled={busy}
              className="ml-auto px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-2"
            >
              {busy && <Loader2 size={12} className="animate-spin" />}
              {t("billingModal.apply")}
            </button>
          </div>
        </section>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2 pt-4 border-t border-white/5">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-xs font-bold disabled:opacity-50"
        >
          {t("common.close")}
        </button>
      </div>
    </ModalShell>
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
