import React from "react";
import { COLOR_TAGS, findStampSvg } from "./colorTags.js";

const PREVIEW_W = 320;
const PREVIEW_H = 200;
const PADDING = 8;

const BOX_W = 160;
const BOX_H = 56;
const STAMP_W = 64;
const STAMP_H = 64;
const TEXT_W = 80;
const TEXT_H = 22;

function dimsFor(type) {
  if (type === "stamp") return { w: STAMP_W, h: STAMP_H };
  if (type === "text") return { w: TEXT_W, h: TEXT_H };
  return { w: BOX_W, h: BOX_H };
}

function colorizeSvg(svgText, color) {
  if (!svgText) return svgText;
  return svgText.replace(/currentColor/g, color || "#444");
}

function svgToDataUri(svgText) {
  if (!svgText) return null;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgText)}`;
}

function truncateToWidth(text, charWidth, availWidth) {
  if (!text) return "";
  const maxChars = Math.max(1, Math.floor(availWidth / charWidth));
  if (text.length <= maxChars) return text;
  if (maxChars <= 1) return "…";
  return text.slice(0, maxChars - 1) + "…";
}

export default function LinkPreview({
  targetPageId,
  targetObjectId,
  allPages,
  stamps,
  style,
}) {
  const page = (allPages || []).find((p) => p.page_id === targetPageId);
  if (!page) {
    return (
      <div className="arch-link-preview" style={style}>
        <div className="arch-link-preview-title">⚠️ Missing page</div>
        <div className="arch-link-preview-empty">
          link target <code>{targetPageId}</code> not found
        </div>
      </div>
    );
  }
  const objects = page.objects || [];
  const visualObjs = objects.filter((o) => o.type !== "edge");

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const o of visualObjs) {
    const { w, h } = dimsFor(o.type);
    minX = Math.min(minX, o.x ?? 0);
    minY = Math.min(minY, o.y ?? 0);
    maxX = Math.max(maxX, (o.x ?? 0) + w);
    maxY = Math.max(maxY, (o.y ?? 0) + h);
  }
  if (!isFinite(minX)) {
    return (
      <div className="arch-link-preview" style={style}>
        <div className="arch-link-preview-title">{page.name}</div>
        <div className="arch-link-preview-empty">(empty page)</div>
      </div>
    );
  }
  const contentW = Math.max(1, maxX - minX);
  const contentH = Math.max(1, maxY - minY);
  const innerW = PREVIEW_W - PADDING * 2;
  const innerH = PREVIEW_H - PADDING * 2;
  const scale = Math.min(innerW / contentW, innerH / contentH);
  const offsetX = PADDING + (innerW - contentW * scale) / 2 - minX * scale;
  const offsetY = PADDING + (innerH - contentH * scale) / 2 - minY * scale;

  const objMap = new Map(objects.map((o) => [o.id, o]));
  const target = targetObjectId ? objMap.get(targetObjectId) : null;
  const targetLabel = target ? target.label || target.id : null;

  // Constant-output font size: divide by `scale` so the text inside the
  // scaled <g> renders at ~the chosen pixel size on screen.
  const labelPx = 11;
  const fidPx = 8;
  const fontSize = labelPx / scale;
  const charWidth = labelPx * 0.55; // rough, in screen pixels
  const stampLabelPx = 9;
  const stampLabelFs = stampLabelPx / scale;
  const stampLabelChar = stampLabelPx * 0.55;

  return (
    <div className="arch-link-preview" style={style}>
      <div className="arch-link-preview-title">{page.name}</div>
      <svg
        width={PREVIEW_W}
        height={PREVIEW_H}
        className="arch-link-preview-svg"
      >
        <rect x={0} y={0} width={PREVIEW_W} height={PREVIEW_H} fill="#f8fafc" />
        <g transform={`translate(${offsetX} ${offsetY}) scale(${scale})`}>
          {/* edges first so nodes paint over them */}
          {objects
            .filter((o) => o.type === "edge")
            .map((e) => {
              const a = objMap.get(e.from);
              const b = objMap.get(e.to);
              if (!a || !b) return null;
              const da = dimsFor(a.type);
              const db = dimsFor(b.type);
              return (
                <line
                  key={e.id}
                  x1={(a.x ?? 0) + da.w / 2}
                  y1={(a.y ?? 0) + da.h / 2}
                  x2={(b.x ?? 0) + db.w / 2}
                  y2={(b.y ?? 0) + db.h / 2}
                  stroke="#94a3b8"
                  strokeWidth={1.5 / scale}
                  opacity={0.7}
                />
              );
            })}
          {visualObjs.map((o) => {
            const { w, h } = dimsFor(o.type);
            const tag = o.color_tag ? COLOR_TAGS[o.color_tag] : null;
            const isTarget = target && o.id === target.id;
            const label = (o.label || "").trim();

            // ---- Stamp: render the actual SVG icon ----
            if (o.type === "stamp") {
              const stampSvg = findStampSvg(stamps, o.stamp_id);
              const iconColor = tag ? tag.color : "#444";
              const dataUri = stampSvg
                ? svgToDataUri(colorizeSvg(stampSvg, iconColor))
                : null;
              const cx = (o.x ?? 0) + w / 2;
              const cy = (o.y ?? 0) + h / 2;
              const availW = w - 4;
              const truncated = label
                ? truncateToWidth(label, stampLabelChar, availW * scale)
                : "";
              return (
                <g key={o.id}>
                  {isTarget && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={w / 2 + 4 / scale}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth={3 / scale}
                    />
                  )}
                  {dataUri ? (
                    <image
                      href={dataUri}
                      x={o.x ?? 0}
                      y={o.y ?? 0}
                      width={w}
                      height={h - 8}
                    />
                  ) : (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={w / 2 - 4}
                      fill={tag ? tag.bg : "#ffffff"}
                      stroke={tag ? tag.color : "#94a3b8"}
                      strokeWidth={1.5 / scale}
                    />
                  )}
                  {truncated && (
                    <text
                      x={cx}
                      y={(o.y ?? 0) + h - 1}
                      textAnchor="middle"
                      fontSize={stampLabelFs}
                      fill="#444"
                      style={{ fontFamily: "inherit" }}
                    >
                      {truncated}
                    </text>
                  )}
                </g>
              );
            }

            // ---- Text annotation: just text, no border ----
            if (o.type === "text") {
              const tx = (o.x ?? 0);
              const ty = (o.y ?? 0) + h / 2 + fontSize / 3;
              const truncated = truncateToWidth(label, charWidth, w * scale);
              return (
                <text
                  key={o.id}
                  x={tx}
                  y={ty}
                  fontSize={fontSize}
                  fontWeight="600"
                  fill={tag ? tag.color : "#1f2937"}
                  style={{ fontFamily: "inherit" }}
                >
                  {truncated}
                </text>
              );
            }

            // ---- Box ----
            const fill = isTarget
              ? "#fef3c7"
              : tag
              ? tag.bg
              : "#ffffff";
            const stroke = isTarget
              ? "#f59e0b"
              : tag
              ? tag.color
              : "#94a3b8";
            const strokeWidth = (isTarget ? 4 : 1.2) / scale;
            const truncated = truncateToWidth(label, charWidth, (w - 8) * scale);
            return (
              <g key={o.id}>
                <rect
                  x={o.x ?? 0}
                  y={o.y ?? 0}
                  width={w}
                  height={h}
                  rx={6}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                />
                {truncated && (
                  <text
                    x={(o.x ?? 0) + 6}
                    y={(o.y ?? 0) + h / 2 + fontSize / 3}
                    fontSize={fontSize}
                    fontWeight="500"
                    fill="#1f2937"
                    style={{ fontFamily: "inherit" }}
                  >
                    {truncated}
                  </text>
                )}
                {o.fid && (
                  <text
                    x={(o.x ?? 0) + 6}
                    y={(o.y ?? 0) + h - 4}
                    fontSize={fidPx / scale}
                    fill="#777"
                    style={{ fontFamily: "ui-monospace, monospace" }}
                  >
                    {o.fid}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="arch-link-preview-meta">
        {targetLabel ? (
          <>🎯 <b>{targetLabel}</b></>
        ) : (
          <>{visualObjs.length} object{visualObjs.length === 1 ? "" : "s"}</>
        )}
      </div>
    </div>
  );
}
