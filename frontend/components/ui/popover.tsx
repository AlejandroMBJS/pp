"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type AnchorRect = { top: number; left: number; width: number; height: number };

type PopoverProps = {
  open: boolean;
  onClose: () => void;
  anchor: AnchorRect | null;
  children: React.ReactNode;
  // Approximate width hint so the popover stays on-screen near the anchor.
  width?: number;
  className?: string;
};

/**
 * Lightweight popover primitive — no Radix. Renders into a portal under
 * document.body, positioned with absolute coords derived from `anchor`.
 *
 * Closes on outside-click, Escape, and viewport resize/scroll. Caller is
 * responsible for computing the anchor (typically `el.getBoundingClientRect()`).
 */
export function Popover({
  open,
  onClose,
  anchor,
  children,
  width = 280,
  className = "",
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    function onScrollOrResize() {
      // Anchor coordinates are stale once the page scrolls; close to avoid
      // a popover floating away from its bar.
      onClose();
    }
    window.addEventListener("keydown", onKey);
    // Defer the click listener so the click that opened the popover doesn't
    // immediately close it.
    const t = setTimeout(() => window.addEventListener("mousedown", onClick), 0);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open || !anchor) return null;
  if (typeof window === "undefined") return null;

  // Prefer below-anchor; flip above if there's no room.
  const margin = 8;
  const estimatedHeight = 200;
  const placeBelow = anchor.top + anchor.height + estimatedHeight + margin <= window.innerHeight;
  const top = placeBelow
    ? anchor.top + anchor.height + margin
    : Math.max(margin, anchor.top - estimatedHeight - margin);
  const rawLeft = anchor.left + anchor.width / 2 - width / 2;
  const left = Math.max(margin, Math.min(window.innerWidth - width - margin, rawLeft));

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      className={`gantt-popover ${className}`}
      style={{
        position: "fixed",
        top,
        left,
        width,
        zIndex: 1000,
      }}
    >
      {children}
    </div>,
    document.body
  );
}
