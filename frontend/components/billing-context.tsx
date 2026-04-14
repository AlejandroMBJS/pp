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

export function BillingProvider({ token, children }: { token: string | null; children: ReactNode }) {
  const [state, setState] = useState<BillingState | null>(null);

  useEffect(() => {
    if (!token) {
      setState(null);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/v1/billing/subscription", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setState(data);
      } catch {
        // ignore — banner just won't show
      }
    }
    load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
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
