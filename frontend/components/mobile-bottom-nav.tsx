"use client";

import { useState } from "react";
import {
  LayoutDashboard, Clock, Users, Camera, FileCheck, Shield,
  Building2, HardHat, MessageSquare, Box, Eye, MonitorPlay, TrendingUp, AlignLeft, Menu
} from "lucide-react";
import { MobileHamburgerMenu } from "./mobile-hamburger-menu";

type MenuItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
};

type MobileMenuConfig = {
  main: MenuItem[];
  hamburger: MenuItem[];
};

const MENU_ICONS_MOBILE: Record<string, React.ReactNode> = {
  overview: <LayoutDashboard size={20} />,
  projects: <HardHat size={20} />,
  team: <Users size={20} />,
  review: <FileCheck size={20} />,
  timeline: <Clock size={20} />,
  capture: <Camera size={20} />,
  history: <FileCheck size={20} />,
  summary: <LayoutDashboard size={20} />,
  gallery: <Camera size={20} />,
  platform: <Building2 size={20} />,
  rbac: <Shield size={20} />,
  finances: <TrendingUp size={20} />,
  journal: <AlignLeft size={20} />,
  messages: <MessageSquare size={20} />,
  blueprints: <Box size={20} />,
  ownergallery: <Camera size={20} />,
};

function mobileMenuForRole(role: string): MobileMenuConfig {
  const r = role?.toLowerCase() ?? "";
  
  switch (r) {
    case "owner":
      return {
        main: [
          { id: "ownergallery", label: "Progreso", icon: MENU_ICONS_MOBILE.ownergallery },
          { id: "blueprints", label: "Planos", icon: MENU_ICONS_MOBILE.blueprints },
          { id: "messages", label: "Mensajes", icon: MENU_ICONS_MOBILE.messages },
          { id: "review", label: "Revisiones", icon: MENU_ICONS_MOBILE.review },
        ],
        hamburger: [
          { id: "team", label: "Team", icon: MENU_ICONS_MOBILE.team },
          { id: "finances", label: "Finanzas", icon: MENU_ICONS_MOBILE.finances },
          { id: "journal", label: "Diario", icon: MENU_ICONS_MOBILE.journal },
          { id: "overview", label: "Resumen", icon: MENU_ICONS_MOBILE.overview },
        ],
      };
    case "supervisor":
      return {
        main: [
          { id: "review", label: "Revisiones", icon: MENU_ICONS_MOBILE.review },
          { id: "blueprints", label: "Planos", icon: MENU_ICONS_MOBILE.blueprints },
          { id: "messages", label: "Mensajes", icon: MENU_ICONS_MOBILE.messages },
          { id: "gallery", label: "Galeria", icon: MENU_ICONS_MOBILE.gallery },
        ],
        hamburger: [
          { id: "timeline", label: "Timeline", icon: MENU_ICONS_MOBILE.timeline },
          { id: "finances", label: "Finanzas", icon: MENU_ICONS_MOBILE.finances },
          { id: "journal", label: "Diario", icon: MENU_ICONS_MOBILE.journal },
        ],
      };
    case "helper":
      return {
        main: [
          { id: "capture", label: "Capturar", icon: MENU_ICONS_MOBILE.capture },
          { id: "history", label: "Historial", icon: MENU_ICONS_MOBILE.history },
        ],
        hamburger: [],
      };
    case "client":
      return {
        main: [
          { id: "summary", label: "Resumen", icon: MENU_ICONS_MOBILE.summary },
          { id: "blueprints", label: "Planos", icon: MENU_ICONS_MOBILE.blueprints },
          { id: "gallery", label: "Galeria", icon: MENU_ICONS_MOBILE.gallery },
        ],
        hamburger: [],
      };
    default:
      return {
        main: [
          { id: "platform", label: "Plataforma", icon: MENU_ICONS_MOBILE.platform },
          { id: "rbac", label: "RBAC", icon: MENU_ICONS_MOBILE.rbac },
        ],
        hamburger: [],
      };
  }
}

type MobileBottomNavProps = {
  role: string;
  activeView: string;
  onViewChange: (view: string) => void;
  pendingCount?: number;
};

export function MobileBottomNav({
  role,
  activeView,
  onViewChange,
  pendingCount = 0,
}: MobileBottomNavProps) {
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const menu = mobileMenuForRole(role);
  const hasHamburger = menu.hamburger.length > 0;

  return (
    <>
      <nav className="mobile-bottom-nav">
        {menu.main.map((item) => {
          const isActive = activeView === item.id;
          const showBadge = item.id === "review";
          const count = showBadge ? pendingCount : 0;
          
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-icon ${isActive ? "active" : ""}`}
              onClick={() => onViewChange(item.id)}
              aria-label={item.label}
            >
              <span className="icon-wrapper">{item.icon}</span>
              <span className="label">{item.label}</span>
              {count > 0 && (
                <span className="nav-badge">{count > 9 ? "9+" : count}</span>
              )}
            </button>
          );
        })}

        {hasHamburger && (
          <button
            type="button"
            className={`nav-icon ${hamburgerOpen ? "active" : ""}`}
            onClick={() => setHamburgerOpen(!hamburgerOpen)}
            aria-label="Mas opciones"
          >
            <span className="icon-wrapper"><Menu size={20} /></span>
            <span className="label">Mas</span>
          </button>
        )}
      </nav>

      {hasHamburger && (
        <MobileHamburgerMenu
          items={menu.hamburger}
          isOpen={hamburgerOpen}
          onClose={() => setHamburgerOpen(false)}
          activeView={activeView}
          onViewChange={(view) => {
            onViewChange(view);
            setHamburgerOpen(false);
          }}
        />
      )}
    </>
  );
}