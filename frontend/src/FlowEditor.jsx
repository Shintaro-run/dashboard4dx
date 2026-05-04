import React from "react";

function pageNameOf(pages, pageId) {
  return (pages.find((p) => p.id === pageId) || {}).name || pageId;
}

function AnchorRow({ anchor, pages, role, pickMode, onPick, onClear }) {
  const picking = pickMode === role;
  return (
    <div className={`arch-flow-anchor${picking ? " picking" : ""}`}>
      <div className="arch-flow-anchor-display">
        {anchor ? (
          <>
            <span className="arch-flow-anchor-page">
              {pageNameOf(pages, anchor.page_id)}
            </span>
            <span className="arch-flow-anchor-arrow"> · </span>
            <code className="arch-flow-anchor-id">{anchor.object_id}</code>
          </>
        ) : (
          <em className="arch-flow-anchor-none">(not set)</em>
        )}
      </div>
      <div className="arch-flow-anchor-actions">
        <button
          className="arch-btn arch-btn-tiny"
          onClick={() => onPick(role)}
          title="Click here, then click any object on any page"
        >
          {picking ? "Picking…" : anchor ? "Re-pick" : "Pick"}
        </button>
        {anchor && onClear && (
          <button
            className="arch-btn arch-btn-tiny"
            onClick={() => onClear(role)}
            title="Clear"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

export default function FlowEditor({
  flow,
  pages,
  pickMode,
  onChange,
  onPick,
  onCancelPick,
  onSave,
  onCancel,
}) {
  const setName = (n) => onChange({ ...flow, name: n });
  const setColor = (c) => onChange({ ...flow, color: c });

  const clearAnchor = (role) => {
    if (role === "start") onChange({ ...flow, start: null });
    else if (role === "end") onChange({ ...flow, end: null });
    else if (role.startsWith("stop_")) {
      const idx = parseInt(role.split("_")[1], 10);
      const next = [...(flow.stops || [])];
      next.splice(idx, 1);
      onChange({ ...flow, stops: next });
    }
  };

  const moveStop = (idx, delta) => {
    const next = [...(flow.stops || [])];
    const j = idx + delta;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange({ ...flow, stops: next });
  };

  return (
    <div className="arch-rail arch-rail-right arch-rail-flow-edit">
      <div className="arch-rail-title">Editing flow</div>

      <label className="arch-field">
        <span>Name</span>
        <input
          type="text"
          value={flow.name || ""}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className="arch-field">
        <span>Color</span>
        <div className="arch-flow-color-row">
          <input
            type="color"
            value={flow.color || "#3b82f6"}
            onChange={(e) => setColor(e.target.value)}
          />
          <input
            type="text"
            value={flow.color || "#3b82f6"}
            onChange={(e) => setColor(e.target.value)}
            className="arch-flow-color-text"
          />
        </div>
      </label>

      <div className="arch-field">
        <span>📍 Start</span>
        <AnchorRow
          anchor={flow.start}
          pages={pages}
          role="start"
          pickMode={pickMode}
          onPick={onPick}
          onClear={clearAnchor}
        />
      </div>

      <div className="arch-field">
        <span>⏵ Transit stops</span>
        <div className="arch-flow-stops">
          {(flow.stops || []).map((stop, idx) => (
            <div key={idx} className="arch-flow-stop">
              <span className="arch-flow-stop-num">{idx + 1}.</span>
              <AnchorRow
                anchor={stop}
                pages={pages}
                role={`stop_${idx}`}
                pickMode={pickMode}
                onPick={onPick}
                onClear={clearAnchor}
              />
              <div className="arch-flow-stop-order">
                <button
                  className="arch-btn arch-btn-tiny"
                  disabled={idx === 0}
                  onClick={() => moveStop(idx, -1)}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  className="arch-btn arch-btn-tiny"
                  disabled={idx === (flow.stops || []).length - 1}
                  onClick={() => moveStop(idx, +1)}
                  title="Move down"
                >
                  ↓
                </button>
              </div>
            </div>
          ))}
          <button
            className="arch-btn"
            onClick={() => onPick("stop_new")}
            disabled={pickMode === "stop_new"}
          >
            {pickMode === "stop_new" ? "Picking…" : "+ Add stop"}
          </button>
        </div>
      </div>

      <div className="arch-field">
        <span>🏁 End</span>
        <AnchorRow
          anchor={flow.end}
          pages={pages}
          role="end"
          pickMode={pickMode}
          onPick={onPick}
          onClear={clearAnchor}
        />
      </div>

      {pickMode && (
        <div className="arch-flow-pick-hint">
          🌀 <b>Pick mode</b> — click any object on the canvas (you can switch
          pages first using the toolbar). The next click captures the anchor.
          <button className="arch-btn arch-btn-tiny" onClick={onCancelPick}>
            Cancel
          </button>
        </div>
      )}

      <div className="arch-field-row">
        <button className="arch-btn" onClick={onSave}>
          💾 Save
        </button>
        <button className="arch-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
