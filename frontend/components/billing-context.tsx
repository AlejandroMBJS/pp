"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type BillingPlan = "starter" | "professional" | "business" | "enterprise";
export type BillingStatus = "trialing" | "active" | "past_due" | "canceled" | "read_only";

export type BillingLimits = {
  MaxActiveProjects: number;
  MaxInternalUsers: number;
  MaxClientGuests: number;
  MaxCapturesPerMonth: number;
  MaxStorageBytes: number;
  MaxBlueprintFiles: number;
};

export type BillingUsage = {
  active_projects: number;
  internal_users: number;
  client_guests: number;
  captures_this_month: number;
  storage_bytes: number;
  blueprint_files: number;
};

export type BillingState = {
  subscription: {
    id: string;
    plan: BillingPlan;
    status: BillingStatus;
    trial_ends_at: string | null;
    current_period_ends_at: string | null;
    days_until_trial_end: number;
    cancel_at_period_end: boolean;
  };
  features: Record<string, boolean>;
  limits: BillingLimits;
  usage?: BillingUsage;
};

const BillingContext = createContext<BillingState | null>(null);

const HEALTHY_INTERVAL_MS = 60_000;
const BACKOFF_START_MS = 60_000;
const BACKOFF_MAX_MS = 300_000;

export function BillingProvider({ token, children }: { token: string | null; children: ReactNode }) {
  const [state, setState] = useState<BillingState | null>(null);

  useEffect(() => {
    if (!token) {
      setState(null);
      return;
    }
    // Each token epoch gets its own abort + timer lifecycle. When the token
    // changes (login, logout, impersonation) we tear everything down cleanly so
    // no stale in-flight request can resolve into the new session.
    let cancelled = false;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let backoffMs = BACKOFF_START_MS;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, delayMs);
    };

    const load = async () => {
      if (cancelled) return;
      if (controller) controller.abort();
      controller = new AbortController();
      try {
        const res = await fetch("/api/v1/billing/subscription", {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (cancelled) return;
        if (!res.ok) {
          // 401 means the token is dead — stop polling until the token changes.
          if (res.status === 401) {
            setState(null);
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (cancelled) return;
        setState(data);
        backoffMs = BACKOFF_START_MS;
        schedule(HEALTHY_INTERVAL_MS);
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        schedule(backoffMs);
        backoffMs = Math.min(BACKOFF_MAX_MS, backoffMs * 2);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (controller) controller.abort();
    };
  }, [token]);

  const value = useMemo(() => state, [state]);
  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling() {
  return useContext(BillingContext);
}

export function useFeature(name: string): boolean {
  const billing = useBilling();
  if (!billing) return true; // fail open while loading
  return !!billing.features[name];
}
