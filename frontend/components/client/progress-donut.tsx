"use client";

type ProgressDonutProps = {
  value: number; // 0..100
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
};

export function ProgressDonut({
  value,
  size = 176,
  strokeWidth = 14,
  label,
  sublabel,
}: ProgressDonutProps) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (v / 100) * circumference;

  return (
    <div className="progress-donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="donut-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent-blue)" />
            <stop offset="100%" stopColor="var(--accent-purple)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#donut-grad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
      </svg>
      <div className="progress-donut-center">
        <div className="progress-donut-value">{v}%</div>
        {label && <div className="progress-donut-label">{label}</div>}
        {sublabel && <div className="progress-donut-sub">{sublabel}</div>}
      </div>
    </div>
  );
}
