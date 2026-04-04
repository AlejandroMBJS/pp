import type { ReactNode } from "react";

type ListRowProps = {
  title: string;
  meta?: string;
  badge?: string;
  badgeColor?: "green" | "amber" | "red" | "blue" | "gray";
  compact?: boolean;
  onClick?: () => void;
  right?: ReactNode;
};

const badgeColorMap = {
  green: "badge badge-green",
  amber: "badge badge-amber",
  red:   "badge badge-red",
  blue:  "badge badge-blue",
  gray:  "badge badge-gray",
};

export function ListRow({ title, meta, badge, badgeColor = "gray", compact = false, onClick, right }: ListRowProps) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      className={`flex w-full items-center justify-between rounded-xl border border-gray-100 bg-white ${compact ? "px-3 py-2.5" : "px-4 py-3.5"} text-left transition-colors ${onClick ? "cursor-pointer hover:bg-gray-50" : ""}`}
      onClick={onClick}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-gray-900">{title}</div>
        {meta && <div className="mt-0.5 truncate text-xs text-gray-500">{meta}</div>}
      </div>
      <div className="ml-3 flex flex-shrink-0 items-center gap-2">
        {badge && <span className={badgeColorMap[badgeColor]}>{badge}</span>}
        {right}
      </div>
    </Tag>
  );
}
