import React, { useEffect, useMemo, useRef, useState } from "react";

const MAX_RESULTS = 50;

function matchesQuery(entry, q) {
  if (!q) return false;
  const fields = [
    entry.label,
    entry.fid,
    entry.page_name,
    entry.color_tag,
    entry.stamp_id,
    ...(entry.attachment_files || []),
  ];
  for (const v of fields) {
    if (v && String(v).toLowerCase().includes(q)) return true;
  }
  return false;
}

function whichMatched(entry, q) {
  const tags = [];
  if (entry.label && entry.label.toLowerCase().includes(q)) tags.push("label");
  if (entry.fid && entry.fid.toLowerCase().includes(q)) tags.push("FID");
  if (entry.page_name && entry.page_name.toLowerCase().includes(q)) tags.push("page");
  if (entry.color_tag && entry.color_tag.toLowerCase().includes(q)) tags.push("tag");
  if (entry.stamp_id && entry.stamp_id.toLowerCase().includes(q)) tags.push("stamp");
  if ((entry.attachment_files || []).some((f) => f.toLowerCase().includes(q))) {
    tags.push("file");
  }
  return tags;
}

export default function Search({ open, onClose, index, onJump }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
      setActiveIdx(0);
    }
    if (!open) setQuery("");
  }, [open]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    return (index || []).filter((e) => matchesQuery(e, q)).slice(0, MAX_RESULTS);
  }, [index, q]);

  useEffect(() => {
    setActiveIdx(0);
  }, [q]);

  if (!open) return null;

  const handleKey = (e) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results.length > 0) {
      const r = results[activeIdx] || results[0];
      onJump(r.page_id, r.object_id);
    }
  };

  return (
    <div className="arch-search-backdrop" onMouseDown={onClose}>
      <div
        className="arch-search-panel"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="arch-search-header">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search labels, FIDs, attached filenames, tags…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            className="arch-search-input"
          />
          <button
            className="arch-btn"
            onClick={onClose}
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>
        <div className="arch-search-results">
          {!q && (
            <div className="arch-search-hint">
              Search across every page. ↑↓ to navigate, ↵ to jump, Esc to
              close.
            </div>
          )}
          {q && results.length === 0 && (
            <div className="arch-search-empty">No matches.</div>
          )}
          {results.map((r, i) => {
            const tags = whichMatched(r, q);
            return (
              <div
                key={`${r.page_id}__${r.object_id}`}
                className={`arch-search-result${i === activeIdx ? " active" : ""}`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => onJump(r.page_id, r.object_id)}
              >
                <div className="arch-search-result-line1">
                  <span className="arch-search-result-label">
                    {r.label || `(${r.kind || "object"})`}
                  </span>
                  <span className="arch-search-result-page">
                    {r.page_name}
                  </span>
                </div>
                <div className="arch-search-result-meta">
                  <span className="arch-search-meta-id">{r.object_id}</span>
                  {r.fid && (
                    <span className="arch-search-meta-fid">{r.fid}</span>
                  )}
                  {r.color_tag && (
                    <span className="arch-search-meta-tag">{r.color_tag}</span>
                  )}
                  {r.stamp_id && (
                    <span className="arch-search-meta-stamp">{r.stamp_id}</span>
                  )}
                  {(r.attachment_files || []).length > 0 && (
                    <span className="arch-search-meta-attach">
                      📎 {r.attachment_files.length}
                    </span>
                  )}
                  {tags.length > 0 && (
                    <span className="arch-search-meta-matched">
                      matched: {tags.join(", ")}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
