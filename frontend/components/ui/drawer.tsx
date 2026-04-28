"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  width?: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function Drawer({ open, onClose, title, subtitle, width = 480, children, footer }: DrawerProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus first focusable element inside drawer.
    setTimeout(() => {
      const first = ref.current?.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
      first?.focus();
    }, 50);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (typeof window === "undefined") return null;
  if (!open) return null;

  return createPortal(
    <div className="drawer-root" role="dialog" aria-modal="true" aria-label={title}>
      <div className="drawer-backdrop" onClick={onClose} />
      <div
        ref={ref}
        className="drawer-panel"
        style={{ width: `min(${width}px, 100vw)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-header">
          <div className="min-w-0 flex-1">
            {title && <h2 className="drawer-title">{title}</h2>}
            {subtitle && <p className="drawer-subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer && <footer className="drawer-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
