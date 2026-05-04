import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Handle, Position } from "reactflow";
import { COLOR_TAGS, findStampSvg } from "./colorTags.js";
import LinkPreview from "./LinkPreview.jsx";

const HOVER_DELAY_MS = 400;

function useHoverPreview() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef(null);
  const timerRef = useRef(null);
  const onEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const rect = ref.current && ref.current.getBoundingClientRect();
      if (rect) {
        const w = 300;
        const h = 220;
        let x = rect.right + 10;
        let y = rect.bottom + 4;
        if (x + w > window.innerWidth - 8) x = window.innerWidth - w - 8;
        if (y + h > window.innerHeight - 8) y = rect.top - h - 4;
        setPos({ x: Math.max(8, x), y: Math.max(8, y) });
      }
      setOpen(true);
    }, HOVER_DELAY_MS);
  };
  const onLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setOpen(false);
  };
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);
  return { ref, open, pos, onEnter, onLeave };
}

export default function StampNode({ id, data, selected }) {
  const tag = data.colorTag ? COLOR_TAGS[data.colorTag] : null;
  const svg = findStampSvg(data._stamps, data.stampId);
  const overlay = data._overlayColor;
  const color = overlay
    ? overlay.border
    : tag
    ? tag.color
    : "#444";
  const iconBg = overlay ? overlay.bg : "transparent";
  const hasLink = !!data.linkToPage;
  const hasAttach = !!data._hasAttach;
  const diffKind = data._diffKind || null;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label || "");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) setDraft(data.label || "");
  }, [data.label, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const pageHover = useHoverPreview();
  const objHover = useHoverPreview();

  const startEdit = (e) => {
    if (data._editingDisabled) return;
    e.stopPropagation();
    setDraft(data.label || "");
    setEditing(true);
  };
  const commit = () => {
    if (data._onUpdateLabel) data._onUpdateLabel(id, draft);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(data.label || "");
    setEditing(false);
  };

  return (
    <div
      className={`arch-stamp${selected ? " selected" : ""}${hasLink ? " has-link" : ""}${hasAttach ? " has-attach" : ""}${diffKind ? ` diff-${diffKind}` : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <div
        className="arch-stamp-icon"
        style={{
          color,
          background: iconBg,
          border: overlay ? `1.5px solid ${overlay.border}` : "none",
        }}
        dangerouslySetInnerHTML={{ __html: svg || "" }}
      />
      {editing ? (
        <input
          ref={inputRef}
          className="arch-stamp-label-input nodrag nopan"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div
          className="arch-stamp-label"
          onDoubleClick={startEdit}
          title={data._editingDisabled ? undefined : "Double-click to edit"}
        >
          {data.label || data.stampId}
        </div>
      )}
      {data.fid && <div className="arch-box-fid">{data.fid}</div>}
      {data._overlayMetrics && data._overlayMetrics.length > 0 && (
        <div className="arch-overlay-chips arch-stamp-overlay-chips">
          {data._overlayMetrics.map((m) => (
            <span
              key={m.key}
              className="arch-overlay-chip"
              style={{ background: m.bg, color: m.border, borderColor: m.border }}
              title={`${m.label}: ${m.value}`}
            >
              {m.label} {m.value}
            </span>
          ))}
        </div>
      )}
      {hasLink && (
        <div
          ref={pageHover.ref}
          className="arch-node-badge arch-node-badge-link"
          title={data._linkBadgeTitle || "Jump to linked page"}
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            pageHover.onLeave();
            if (data._onOpenLinkedPage && data.linkToPage) {
              data._onOpenLinkedPage(data.linkToPage);
            }
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={pageHover.onEnter}
          onMouseLeave={pageHover.onLeave}
        >
          ↗
        </div>
      )}
      {data.linkToObject && (
        <div
          ref={objHover.ref}
          className="arch-node-badge arch-node-badge-objlink"
          title={data._objLinkBadgeTitle || "Jump to linked object"}
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            objHover.onLeave();
            if (data._onOpenLinkedObject) {
              data._onOpenLinkedObject(data.linkToObject);
            }
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={objHover.onEnter}
          onMouseLeave={objHover.onLeave}
        >
          ↗
        </div>
      )}
      {hasLink && pageHover.open && data._allPages &&
        createPortal(
          <LinkPreview
            targetPageId={data.linkToPage}
            allPages={data._allPages}
            stamps={data._stamps}
            style={{ position: "fixed", left: pageHover.pos.x, top: pageHover.pos.y, zIndex: 9999 }}
          />,
          document.body
        )}
      {data.linkToObject && objHover.open && data._allPages &&
        createPortal(
          <LinkPreview
            targetPageId={data.linkToObject.page_id}
            targetObjectId={data.linkToObject.object_id}
            allPages={data._allPages}
            stamps={data._stamps}
            style={{ position: "fixed", left: objHover.pos.x, top: objHover.pos.y, zIndex: 9999 }}
          />,
          document.body
        )}
      {hasAttach && (
        <div className="arch-node-badge arch-node-badge-attach" title="Has attachments">
          📎
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
