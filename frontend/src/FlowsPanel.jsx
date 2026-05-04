import React from "react";

export default function FlowsPanel({
  flows,
  enabledIds,
  editingId,
  onToggle,
  onCreate,
  onEdit,
  onDelete,
}) {
  return (
    <div className="arch-palette-block">
      <div className="arch-rail-title">Data flow animation</div>
      <button
        className="arch-btn arch-flow-new"
        onClick={onCreate}
        disabled={!!editingId}
      >
        ➕ New flow
      </button>
      {(flows || []).length === 0 && (
        <div className="arch-rail-empty arch-flow-empty">
          No flows yet — click <b>➕ New flow</b> to create one.
        </div>
      )}
      <div className="arch-flow-list">
        {(flows || []).map((f) => {
          const isEditing = f.id === editingId;
          return (
            <div
              key={f.id}
              className={`arch-flow-row${isEditing ? " editing" : ""}`}
            >
              <input
                type="checkbox"
                checked={enabledIds.has(f.id)}
                onChange={() => onToggle(f.id)}
                title="Enable / disable (resets each session)"
              />
              <span
                className="arch-flow-color"
                style={{ background: f.color || "#3b82f6" }}
              />
              <span className="arch-flow-name" title={f.name}>
                {f.name}
              </span>
              <button
                className="arch-btn arch-btn-tiny"
                onClick={() => onEdit(f.id)}
                disabled={!!editingId}
                title="Edit flow"
              >
                ✏
              </button>
              <button
                className="arch-btn arch-btn-tiny arch-btn-danger"
                onClick={() => onDelete(f.id)}
                disabled={!!editingId}
                title="Delete flow"
              >
                🗑
              </button>
            </div>
          );
        })}
      </div>
      <div className="arch-rail-hint">
        Toggle on/off resets every session.
      </div>
    </div>
  );
}
