export const COLOR_TAGS = {
  frontend:   { label: "Frontend",   color: "#3b82f6", bg: "#eff6ff" },
  backend:    { label: "Backend",    color: "#10b981", bg: "#ecfdf5" },
  data:       { label: "Data",       color: "#8b5cf6", bg: "#f5f3ff" },
  external:   { label: "External",   color: "#f97316", bg: "#fff7ed" },
  infra:      { label: "Infra",      color: "#64748b", bg: "#f1f5f9" },
  deprecated: { label: "Deprecated", color: "#ef4444", bg: "#fef2f2" },
  accent:     { label: "Accent",     color: "#ec4899", bg: "#fdf2f8" },
  neutral:    { label: "Neutral",    color: "#94a3b8", bg: "#f8fafc" },
};

const LINK_BLUE = "#3b82f6";
const NEUTRAL_GREY = "#888";

export function findStampSvg(stamps, stampId) {
  if (!stamps || !stampId) return null;
  for (const cat of Object.keys(stamps)) {
    const found = (stamps[cat] || []).find((s) => s.id === stampId);
    if (found) return found.svg;
  }
  return null;
}

export function newId(prefix) {
  return (
    prefix +
    Math.random().toString(36).slice(2, 8) +
    Date.now().toString(36).slice(-3)
  );
}

/**
 * Edge styling rules:
 *   - colorTag set       → tag colour
 *   - else has linkToPage→ blue
 *   - else               → grey
 *   - has attachments    → dashed
 */
export function edgeStyle({ colorTag, hasLink, hasAttach }) {
  let stroke;
  if (colorTag && COLOR_TAGS[colorTag]) stroke = COLOR_TAGS[colorTag].color;
  else if (hasLink) stroke = LINK_BLUE;
  else stroke = NEUTRAL_GREY;
  return {
    stroke,
    strokeWidth: 2,
    strokeDasharray: hasAttach ? "5 4" : undefined,
  };
}

// ---------------- live-status overlay ----------------

export const METRIC_INFO = {
  actual_progress: { label: "進捗 %",   higher_is_better: true,  scale: 1.0,  format: "pct" },
  risk_score:      { label: "リスク",   higher_is_better: false, scale: 1.0,  format: "ratio" },
  test_run_rate:   { label: "実施率",   higher_is_better: true,  scale: 1.0,  format: "pct" },
  test_pass_rate:  { label: "合格率",   higher_is_better: true,  scale: 1.0,  format: "pct" },
  incident_rate:   { label: "障害率",   higher_is_better: false, scale: 1.0,  format: "pct" },
  defect_rate:     { label: "NG率",     higher_is_better: false, scale: 1.0,  format: "pct" },
  delay_days:      { label: "遅延日",   higher_is_better: false, scale: 30.0, format: "days" },
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Compute background + border colours for a single metric value.
 * Returns null if the value is missing or the metric is unknown.
 * Hue ramp: 0° (red) → 60° (yellow) → 120° (green); good values are green.
 */
export function computeOverlayColor(value, metric) {
  if (value == null || Number.isNaN(value)) return null;
  const info = METRIC_INFO[metric];
  if (!info) return null;
  const norm = clamp01(value / info.scale);
  const goodness = info.higher_is_better ? norm : 1 - norm;
  const hue = goodness * 120;
  return {
    bg: `hsla(${hue}, 70%, 60%, 0.20)`,
    border: `hsl(${hue}, 65%, 45%)`,
  };
}

export function formatMetricValue(value, metric) {
  if (value == null || Number.isNaN(value)) return "—";
  const info = METRIC_INFO[metric];
  if (!info) return String(value);
  if (info.format === "pct") return `${(value * 100).toFixed(0)}%`;
  if (info.format === "ratio") return value.toFixed(2);
  if (info.format === "days") return `${value.toFixed(0)}d`;
  return String(value);
}
