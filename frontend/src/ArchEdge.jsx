import React from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from "reactflow";

const DIFF_STROKE = {
  added:    "#10b981",
  removed:  "#ef4444",
  moved:    "#3b82f6",
  changed:  "#f59e0b",
  unchanged: "#cbd5e1",
};

export default function ArchEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  data,
  label,
  selected,
}) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const fid = data?.fid;
  const diffKind = data?._diffKind;
  const showLabel = !!label || !!fid;

  const finalStyle = diffKind
    ? {
        stroke: DIFF_STROKE[diffKind] || "#888",
        strokeWidth: diffKind === "unchanged" ? 1.5 : 2.5,
        strokeDasharray: diffKind === "removed" ? "4 3" : undefined,
        opacity: diffKind === "removed" || diffKind === "unchanged" ? 0.55 : 1,
      }
    : style;

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={finalStyle} />
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            className={`arch-edge-label${selected ? " selected" : ""}`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label && <span className="arch-edge-text">{label}</span>}
            {fid && <span className="arch-edge-fid-badge">{fid}</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
