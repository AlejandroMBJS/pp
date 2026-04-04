"use client";

import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "./ui/empty-state";
import { ListRow } from "./ui/list-row";

type RBACRule = { resource: string; role: string; effect: string };

type AdminCanvasProps = {
  activeView: string;
  tenants: Array<{ id: string; name: string; slug: string }>;
  rbac: RBACRule[];
  token?: string;
};

const effectColor: Record<string, "green" | "red"> = {
  allow: "green",
  deny:  "red",
};

export function AdminCanvas({ activeView, tenants, rbac, token }: AdminCanvasProps) {
  if (activeView === "platform") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform</h1>
          <p className="mt-1 text-sm text-gray-500">
            Active tenants and centralized platform configuration.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="card px-5 py-5">
            <div className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              Active tenants
            </div>
            <div className="mt-2 text-4xl font-bold text-gray-900">{tenants.length}</div>
            <div className="text-sm text-gray-500">registered companies</div>
          </div>
          <div className="card px-5 py-5">
            <div className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              RBAC rules
            </div>
            <div className="mt-2 text-4xl font-bold text-gray-900">{rbac.length}</div>
            <div className="text-sm text-gray-500">configured permissions</div>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            Registered tenants
          </h2>
          {tenants.length === 0 ? (
            <EmptyState text="No tenants registered yet." />
          ) : (
            <div className="space-y-2">
              {tenants.map((tenant) => (
                <ListRow
                  key={tenant.id}
                  title={tenant.name}
                  meta={`Slug: ${tenant.slug}`}
                  badge="active"
                  badgeColor="green"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (activeView === "rbac") {
    const [search, setSearch] = useState("");
    const [updating, setUpdating] = useState<string | null>(null);

    const filtered = rbac.filter(r => 
      r.resource.toLowerCase().includes(search.toLowerCase()) ||
      r.role.toLowerCase().includes(search.toLowerCase())
    );

    const grouped = filtered.reduce<Record<string, RBACRule[]>>((acc, rule) => {
      if (!acc[rule.resource]) acc[rule.resource] = [];
      acc[rule.resource].push(rule);
      return acc;
    }, {});

    const handleToggle = async (rule: RBACRule) => {
      const nextEffect = rule.effect === "allow" ? "deny" : "allow";
      const id = `${rule.resource}-${rule.role}`;
      setUpdating(id);
      
      try {
        const res = await fetch("/api/v1/admin/rbac", {
          method: "PUT",
          headers: { 
            "Content-Type": "application/json",
            ...(token ? { "Authorization": `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ ...rule, effect: nextEffect }),
        });
        if (res.ok) {
          window.location.reload(); 
        }
      } catch (e) {
        console.error(e);
        toast.error("No se pudo actualizar la regla RBAC.");
      } finally {
        setUpdating(null);
      }
    };

    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight uppercase">Access Control</h1>
            <p className="mt-1 text-sm text-white/40 font-medium">
              Operational permission matrix for platform governance.
            </p>
          </div>
          <div className="relative">
            <input 
              type="text"
              placeholder="Filter resource..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/50 w-full md:w-64"
            />
          </div>
        </div>

        {Object.keys(grouped).length === 0 ? (
          <EmptyState text="No rules matched your search." />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {Object.entries(grouped).map(([resource, rules]) => (
              <div key={resource} className="glass-card overflow-hidden border-white/5 hover:border-white/10 transition-colors">
                <div className="bg-white/[0.03] px-5 py-3 border-b border-white/5 flex items-center justify-between">
                  <h3 className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">
                    {resource}
                  </h3>
                  <div className="h-1.5 w-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                </div>
                <div className="p-2 space-y-1">
                  {rules.map((rule) => {
                    const id = `${rule.resource}-${rule.role}`;
                    const isBusy = updating === id;
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between rounded-xl hover:bg-white/[0.03] px-4 py-3 transition-colors group"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-white/90 group-hover:text-white transition-colors">{rule.role}</span>
                          <span className="text-[10px] text-white/30 uppercase font-bold tracking-widest leading-none mt-1">Operating Level</span>
                        </div>
                        
                        <button
                          onClick={() => handleToggle(rule)}
                          disabled={isBusy}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                            rule.effect === "allow" ? "bg-blue-600" : "bg-white/10"
                          } ${isBusy ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                        >
                          <span className="sr-only">Toggle selection</span>
                          <span
                            className={`${
                              rule.effect === "allow" ? "translate-x-6" : "translate-x-1"
                            } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}
