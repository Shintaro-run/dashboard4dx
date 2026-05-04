import React, { useMemo, useState } from "react";

const DRAG_MIME = "application/dashboard4dx-fid";
const MAX_VISIBLE = 200;

export default function FidsPalette({ fids, locked }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return fids || [];
    return (fids || []).filter(
      (f) =>
        f.id.toLowerCase().includes(q) ||
        (f.name && f.name.toLowerCase().includes(q))
    );
  }, [fids, query]);

  const onDragStart = (evt, fid) => {
    if (locked) {
      evt.preventDefault();
      return;
    }
    evt.dataTransfer.setData(DRAG_MIME, JSON.stringify(fid));
    evt.dataTransfer.effectAllowed = "copy";
  };

  const total = (fids || []).length;

  return (
    <div className="arch-palette-block">
      <div className="arch-rail-title">Function IDs</div>
      {total === 0 ? (
        <div className="arch-rail-empty">
          No master loaded. Upload the function master in the 📥 Inputs tab to
          enable FID drag-and-drop.
        </div>
      ) : (
        <>
          <input
            type="text"
            className="arch-fid-search"
            placeholder="Search FIDs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="arch-fid-list">
            {filtered.slice(0, MAX_VISIBLE).map((f) => (
              <div
                key={f.id}
                className={`arch-fid-tile${locked ? " disabled" : ""}`}
                draggable={!locked}
                onDragStart={(e) => onDragStart(e, f)}
                title={f.name}
              >
                <div className="arch-fid-tile-id">{f.id}</div>
                {f.name && (
                  <div className="arch-fid-tile-name">{f.name}</div>
                )}
              </div>
            ))}
            {filtered.length > MAX_VISIBLE && (
              <div className="arch-rail-hint">
                +{filtered.length - MAX_VISIBLE} more — refine search to see them
              </div>
            )}
          </div>
          <div className="arch-rail-hint">
            Drag onto the canvas to create a box pre-bound to that FID.
          </div>
        </>
      )}
    </div>
  );
}

export { DRAG_MIME as FID_DRAG_MIME };
