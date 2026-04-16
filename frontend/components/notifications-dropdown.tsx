"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, X } from "lucide-react";
import { useTranslations } from "next-intl";

type Notification = {
  id: string;
  kind: string;
  severity: string;
  title: string;
  body: string;
  resource?: string;
  threshold_pct?: number;
  read_at?: string | null;
  created_at: string;
};

type Props = {
  token: string;
  unreadCount: number;
  onCountChange: (n: number) => void;
};

function relTime(iso: string, t: ReturnType<typeof useTranslations>) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return t("justNow");
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function NotificationsDropdown({ token, unreadCount, onCountChange }: Props) {
  const t = useTranslations("notifications");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/notifications", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Notification[];
      setItems(data);
      onCountChange(data.filter((n) => !n.read_at).length);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void load();
  }

  async function markRead(id: string) {
    const before = items;
    setItems(items.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n)));
    onCountChange(Math.max(0, unreadCount - 1));
    try {
      const res = await fetch(`/api/v1/notifications/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems(before);
      onCountChange(before.filter((n) => !n.read_at).length);
    }
  }

  async function markAllRead() {
    const before = items;
    setItems(items.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    onCountChange(0);
    try {
      const res = await fetch("/api/v1/notifications/read-all", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems(before);
      onCountChange(before.filter((n) => !n.read_at).length);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-white/60 transition-colors hover:bg-white/5"
        aria-label={t("ariaLabel")}
        onClick={toggle}
      >
        <Bell size={16} />
      </button>
      {unreadCount > 0 && (
        <span
          className="absolute -top-1 -right-1 badge-counter"
          style={{ fontSize: 9, minWidth: 16, height: 16, background: "#ef4444", color: "white" }}
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
      {open && (
        <div className="absolute right-0 top-11 z-50 w-[360px] max-h-[480px] overflow-hidden rounded-2xl border border-white/10 bg-[#0a0e1a] shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="text-sm font-black text-white tracking-tight">{t("title")}</div>
            <div className="flex items-center gap-1">
              {items.some((n) => !n.read_at) && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white/50 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5"
                  title={t("markAllRead")}
                >
                  <CheckCheck size={12} />
                  {t("markAllRead")}
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-white/40 hover:text-white p-1"
                aria-label={t("close")}
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {loading && items.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs text-white/40">{t("loading")}</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs text-white/40">{t("empty")}</div>
            ) : (
              <ul className="divide-y divide-white/5">
                {items.map((n) => {
                  const unread = !n.read_at;
                  const tone =
                    n.severity === "critical"
                      ? "bg-red-500"
                      : n.severity === "warning"
                      ? "bg-amber-500"
                      : "bg-blue-500";
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => unread && markRead(n.id)}
                        className={`w-full text-left px-4 py-3 flex gap-3 transition-colors ${
                          unread ? "bg-white/5 hover:bg-white/10" : "hover:bg-white/5"
                        }`}
                      >
                        <div className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${unread ? tone : "bg-white/10"}`} />
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-bold tracking-tight ${unread ? "text-white" : "text-white/60"}`}>
                            {n.title}
                          </div>
                          <div className="text-xs text-white/50 mt-0.5 line-clamp-2">{n.body}</div>
                          <div className="text-[10px] text-white/30 mt-1 font-medium">{relTime(n.created_at, t)}</div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
