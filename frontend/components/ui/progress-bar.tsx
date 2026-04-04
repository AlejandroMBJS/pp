type ProgressBarProps = {
  value: number; // 0-100
  className?: string;
  size?: "sm" | "md";
  color?: string;
};

export function ProgressBar({ value, className = "", size = "md", color }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const defaultColor = clamped <= 70 ? "#059669" : clamped <= 90 ? "#d97706" : "#dc2626";
  const finalColor = color || defaultColor;
  const height = size === "sm" ? "4px" : "8px";

  return (
    <div className={`progress-track ${className}`} style={{ height }}>
      <div
        className="progress-fill"
        style={{ width: `${clamped}%`, background: finalColor, height }}
      />
    </div>
  );
}
