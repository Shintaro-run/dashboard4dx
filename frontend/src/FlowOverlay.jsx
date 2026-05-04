import React, { useMemo } from "react";

// Approximate node centres. The component schema doesn't store width/height,
// so we use the same defaults BoxNode/StampNode render at.
const BOX_W = 160;
const BOX_H = 56;
const STAMP_W = 80;
const STAMP_H = 80;

function buildPositionMap(nodes, edges) {
  const map = new Map();
  for (const n of nodes) {
    let w = BOX_W;
    let h = BOX_H;
    if (n.type === "stamp") { w = STAMP_W; h = STAMP_H; }
    else if (n.type === "text") { w = 80; h = 22; }
    map.set(n.id, { x: n.position.x + w / 2, y: n.position.y + h / 2 });
  }
  for (const e of edges) {
    const a = map.get(e.source);
    const b = map.get(e.target);
    if (a && b) {
      map.set(e.id, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    }
  }
  return map;
}

export default function FlowOverlay({
  flows,
  enabledIds,
  currentPageId,
  nodes,
  edges,
  viewport,
}) {
  const tx = viewport?.x ?? 0;
  const ty = viewport?.y ?? 0;
  const zoom = viewport?.zoom ?? 1;

  const segments = useMemo(() => {
    const posMap = buildPositionMap(nodes, edges);
    const out = [];
    (flows || []).forEach((flow) => {
      if (!enabledIds.has(flow.id)) return;
      const anchors = [
        flow.start,
        ...(flow.stops || []),
        flow.end,
      ].filter(Boolean);
      for (let i = 0; i < anchors.length - 1; i++) {
        const a = anchors[i];
        const b = anchors[i + 1];
        if (!a || !b) continue;
        if (a.page_id !== currentPageId || b.page_id !== currentPageId) continue;
        const pa = posMap.get(a.object_id);
        const pb = posMap.get(b.object_id);
        if (!pa || !pb) continue;
        out.push({
          flowId: flow.id,
          name: flow.name,
          color: flow.color || "#3b82f6",
          ai: i,
          from: pa,
          to: pb,
        });
      }
    });
    return out;
  }, [flows, enabledIds, currentPageId, nodes, edges]);

  if (segments.length === 0) return null;

  return (
    <svg className="arch-flow-overlay">
      <g transform={`translate(${tx} ${ty}) scale(${zoom})`}>
        {segments.map((s) => (
          <g key={`${s.flowId}_${s.ai}`}>
            <path
              d={`M ${s.from.x} ${s.from.y} L ${s.to.x} ${s.to.y}`}
              stroke={s.color}
              strokeWidth={3}
              fill="none"
              opacity={0.25}
            />
            <path
              d={`M ${s.from.x} ${s.from.y} L ${s.to.x} ${s.to.y}`}
              stroke={s.color}
              strokeWidth={3}
              fill="none"
              className="arch-flow-marching"
              style={{ pointerEvents: "stroke" }}
            >
              <title>{s.name}</title>
            </path>
            <circle
              cx={s.from.x}
              cy={s.from.y}
              r={6 / Math.max(1, zoom)}
              fill={s.color}
              opacity={0.85}
              pointerEvents="none"
            />
            <circle
              cx={s.to.x}
              cy={s.to.y}
              r={6 / Math.max(1, zoom)}
              fill={s.color}
              opacity={0.85}
              pointerEvents="none"
            />
          </g>
        ))}
      </g>
    </svg>
  );
}
