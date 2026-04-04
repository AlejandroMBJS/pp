"use client";

import { useEffect, useRef } from "react";

type MenuItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
};

type MobileHamburgerMenuProps = {
  items: MenuItem[];
  isOpen: boolean;
  onClose: () => void;
  activeView: string;
  onViewChange: (view: string) => void;
};

export function MobileHamburgerMenu({
  items,
  isOpen,
  onClose,
  activeView,
  onViewChange,
}: MobileHamburgerMenuProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (sheetRef.current && !sheetRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="hamburger-backdrop" onClick={onClose}>
      <div
        ref={sheetRef}
        className="hamburger-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`hamburger-item ${isActive ? "active" : ""}`}
              onClick={() => onViewChange(item.id)}
            >
              <span className="hamburger-icon">{item.icon}</span>
              <span className="hamburger-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}