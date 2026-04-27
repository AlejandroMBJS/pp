/**
 * Convert a hex color (#rrggbb) to an rgba() string with the given alpha.
 * Returns "" for invalid input so callers can fall back gracefully.
 */
export function hexToRgba(hex: string | undefined | null, alpha: number): string {
  if (!hex || hex.length < 7 || hex[0] !== "#") return "";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "";
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Build the inline style for a card whose tint should follow the task's
 * color_hex override. Returns undefined when no override is set so the
 * card falls back to its default theme.
 */
/**
 * Build a Map<task_id, color_hex> from a tasks array. Skips tasks without
 * a color override so .get() returns undefined → no tint applied.
 */
export function buildTaskColorMap(
  tasks: Array<{ id: string; color_hex?: string | null }>
): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of tasks) {
    if (t.color_hex) m.set(t.id, t.color_hex);
  }
  return m;
}

export function taskTintStyle(
  colorHex: string | undefined | null,
  alpha: number = 0.08
): React.CSSProperties | undefined {
  if (!colorHex) return undefined;
  const tint = hexToRgba(colorHex, alpha);
  if (!tint) return undefined;
  return {
    background: tint,
    borderLeft: `3px solid ${colorHex}`,
  };
}
