"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, FolderPlus, ListPlus, UserPlus, Lock } from "lucide-react";

type FabAction = {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  onClick: () => void;
  disabled?: boolean;
  disabledHint?: string;
};

type Props = {
  actions: FabAction[];
};

export function FabActions({ actions }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="fixed bottom-6 right-6 z-50 flex flex-col-reverse items-end gap-3">
      {/* Main FAB button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-all duration-300 hover:scale-105 active:scale-95"
        style={{
          background: open
            ? "linear-gradient(135deg, #ef4444, #dc2626)"
            : "var(--accent-gradient)",
          boxShadow: open
            ? "0 6px 30px rgba(239,68,68,0.4)"
            : "0 6px 30px color-mix(in srgb, var(--accent-blue) 40%, transparent)",
        }}
      >
        <Plus
          size={24}
          className="text-white transition-transform duration-300"
          style={{ transform: open ? "rotate(45deg)" : "rotate(0deg)" }}
        />
      </button>

      {/* Action buttons — stack upward */}
      {actions.map((action, i) => (
        <div
          key={action.id}
          className="flex items-center gap-2 transition-all duration-300 ease-out"
          style={{
            transform: open ? "translateY(0) scale(1)" : "translateY(20px) scale(0.5)",
            opacity: open ? 1 : 0,
            pointerEvents: open ? "auto" : "none",
            transitionDelay: open ? `${(actions.length - 1 - i) * 60}ms` : "0ms",
          }}
        >
          <span
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-white whitespace-nowrap"
            style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
          >
            {action.disabled && action.disabledHint ? action.disabledHint : action.label}
          </span>
          <button
            onClick={() => { setOpen(false); action.onClick(); }}
            title={action.disabled ? action.disabledHint : undefined}
            className="flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-110 active:scale-95 disabled:hover:scale-100"
            style={{
              background: action.disabled ? "rgba(255,255,255,0.08)" : action.color,
              boxShadow: action.disabled ? "none" : `0 4px 16px color-mix(in srgb, ${action.color} 25%, transparent)`,
              opacity: action.disabled ? 0.6 : 1,
              cursor: action.disabled ? "not-allowed" : "pointer",
            }}
          >
            {action.icon}
          </button>
        </div>
      ))}
    </div>
  );
}

export { FolderPlus, ListPlus, UserPlus, Lock };
