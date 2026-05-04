import React from "react";

const DRAG_MIME = "application/dashboard4dx-stamp";

export default function StampsPalette({ stamps, locked }) {
  const cats = Object.keys(stamps || {}).sort();
  const onDragStart = (evt, stampId) => {
    if (locked) {
      evt.preventDefault();
      return;
    }
    evt.dataTransfer.setData(DRAG_MIME, stampId);
    evt.dataTransfer.effectAllowed = "copy";
  };
  return (
    <div className="arch-palette-block">
      <div className="arch-rail-title">Stamps</div>
      {cats.length === 0 && (
        <div className="arch-rail-empty">No stamps loaded</div>
      )}
      {cats.map((cat) => (
        <div key={cat} className="arch-rail-section">
          <div className="arch-rail-section-title">{cat}</div>
          <div className="arch-rail-section-grid">
            {(stamps[cat] || []).map((s) => (
              <div
                key={s.id}
                className={`arch-stamp-tile${locked ? " disabled" : ""}`}
                title={s.label}
                draggable={!locked}
                onDragStart={(e) => onDragStart(e, s.id)}
              >
                <span
                  className="arch-stamp-tile-icon"
                  dangerouslySetInnerHTML={{ __html: s.svg }}
                />
                <span className="arch-stamp-tile-label">{s.id}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="arch-rail-hint">Drag a stamp onto the canvas.</div>
    </div>
  );
}

export { DRAG_MIME };
