"use client";

import { useRef, useState } from "react";

type Props = {
  beforeUrl: string;
  afterUrl: string;
  beforeAlt?: string;
  afterAlt?: string;
};

export function BeforeAfterSlider({ beforeUrl, afterUrl, beforeAlt, afterAlt }: Props) {
  const [pct, setPct] = useState(50);
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  function setFromEvent(clientX: number) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    setPct((x / rect.width) * 100);
  }

  function onPointerDown(e: React.PointerEvent) {
    setDragging(true);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setFromEvent(e.clientX);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    setFromEvent(e.clientX);
  }
  function onPointerUp(e: React.PointerEvent) {
    setDragging(false);
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  }

  return (
    <div
      ref={ref}
      className="before-after-slider"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <img src={afterUrl} alt={afterAlt || "After"} className="before-after-img" draggable={false} />
      <div className="before-after-clip" style={{ width: `${pct}%` }}>
        <img
          src={beforeUrl}
          alt={beforeAlt || "Before"}
          className="before-after-img"
          style={{ width: ref.current ? `${ref.current.getBoundingClientRect().width}px` : "100%" }}
          draggable={false}
        />
      </div>
      <span className="before-after-label before-after-label-left">Before</span>
      <span className="before-after-label before-after-label-right">After</span>
      <div className="before-after-handle" style={{ left: `${pct}%` }}>
        <span className="before-after-handle-bar" />
        <span className="before-after-handle-knob">‹›</span>
      </div>
    </div>
  );
}
