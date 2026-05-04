import React, { useEffect, useRef, useState } from "react";
import { COLOR_TAGS } from "./colorTags.js";

// Free-floating text label. No handles, transparent background; allowed to
// overlap any other node (z-index lifted in App.jsx via objToNode).
// Double-click to edit the label inline.
export default function TextNode({ id, data, selected }) {
  const tag = data.colorTag ? COLOR_TAGS[data.colorTag] : null;
  const color = tag ? tag.color : "#1f2937";

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
      className={`arch-text${selected ? " selected" : ""}`}
      style={{ color }}
      onDoubleClick={startEdit}
      title={data._editingDisabled ? undefined : "Double-click to edit"}
    >
      {editing ? (
        <input
          ref={inputRef}
          className="arch-text-input nodrag nopan"
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
          style={{ color }}
        />
      ) : (
        data.label || "(text)"
      )}
    </div>
  );
}
