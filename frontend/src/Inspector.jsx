import React from "react";
import { COLOR_TAGS } from "./colorTags.js";
import { fieldLabel } from "./diff.js";

const DIFF_LABELS = {
  added: "🟢 Added",
  removed: "🔴 Removed",
  moved: "🔵 Moved",
  changed: "🟡 Changed",
  unchanged: "⚪ Unchanged",
};

function fmt(v) {
  if (v == null) return <em>—</em>;
  if (typeof v === "string" && v.length === 0) return <em>(empty)</em>;
  return String(v);
}

function DiffPanel({ summary, selected }) {
  return (
    <div className="arch-rail arch-rail-right arch-rail-diff">
      <div className="arch-rail-title">Diff details</div>
      {summary && (
        <div className="arch-diff-summary">
          <div>🟢 Added: <b>{summary.added || 0}</b></div>
          <div>🔴 Removed: <b>{summary.removed || 0}</b></div>
          <div>🔵 Moved: <b>{summary.moved || 0}</b></div>
          <div>🟡 Changed: <b>{summary.changed || 0}</b></div>
          <div>⚪ Unchanged: <b>{summary.unchanged || 0}</b></div>
        </div>
      )}
      {selected && selected.diffEntry ? (
        <>
          <div className="arch-diff-selected-title">
            {DIFF_LABELS[selected.diffEntry.kind] || selected.diffEntry.kind}
            <span className="arch-diff-selected-id"> · <code>{selected.id}</code></span>
          </div>
          {Object.keys(selected.diffEntry.fields || {}).length > 0 ? (
            <div className="arch-diff-fields">
              {Object.entries(selected.diffEntry.fields).map(([f, [a, b]]) => (
                <div key={f} className="arch-diff-row">
                  <div className="arch-diff-row-name">{fieldLabel(f)}</div>
                  <div className="arch-diff-row-values">
                    <span className="arch-diff-old">{fmt(a)}</span>
                    <span className="arch-diff-arrow">→</span>
                    <span className="arch-diff-new">{fmt(b)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : selected.diffEntry.kind === "moved" ? (
            <div className="arch-rail-hint">
              Position changed; no other fields differ.
            </div>
          ) : (
            <div className="arch-rail-hint">No field differences.</div>
          )}
        </>
      ) : (
        <div className="arch-rail-empty">
          Click any node or edge on the canvas to see what changed.
        </div>
      )}
    </div>
  );
}

export default function Inspector({
  selected,
  locked,
  stamps,
  pages,
  allPages,
  currentPageId,
  attachmentsSummary,
  fids,
  diffActive,
  diffSummary,
  onChange,
  onDelete,
  onOpenLinkedPage,
  onOpenLinkedObject,
}) {
  if (diffActive) {
    return <DiffPanel summary={diffSummary} selected={selected} />;
  }

  if (!selected) {
    return (
      <div className="arch-rail arch-rail-right">
        <div className="arch-rail-title">Inspector</div>
        <div className="arch-rail-empty">
          Select an object to edit. Drag from a node's right edge to another
          node to draw an arrow.
        </div>
      </div>
    );
  }

  const data = selected.data || {};
  const isStamp = selected.kind === "stamp";
  const linkedPage = data.linkToPage
    ? (pages || []).find((p) => p.id === data.linkToPage)
    : null;
  const attach = (attachmentsSummary || {})[selected.id];

  return (
    <div className="arch-rail arch-rail-right">
      <div className="arch-rail-title">Inspector — {selected.kind}</div>

      <label className="arch-field">
        <span>Label</span>
        <input
          type="text"
          value={data.label || ""}
          disabled={locked}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </label>

      <label className="arch-field">
        <span>Color tag</span>
        <select
          value={data.colorTag || ""}
          disabled={locked}
          onChange={(e) => onChange({ colorTag: e.target.value || null })}
        >
          <option value="">— none —</option>
          {Object.entries(COLOR_TAGS).map(([id, t]) => (
            <option key={id} value={id}>{t.label}</option>
          ))}
        </select>
      </label>

      {isStamp && (
        <label className="arch-field">
          <span>Stamp icon</span>
          <select
            value={data.stampId || ""}
            disabled={locked}
            onChange={(e) => onChange({ stampId: e.target.value || null })}
          >
            {Object.entries(stamps || {}).flatMap(([cat, items]) =>
              items.map((s) => (
                <option key={s.id} value={s.id}>{cat} / {s.label}</option>
              ))
            )}
          </select>
        </label>
      )}

      <label className="arch-field">
        <span>Function ID</span>
        <select
          value={data.fid || ""}
          disabled={locked}
          onChange={(e) => onChange({ fid: e.target.value || null })}
        >
          <option value="">— none —</option>
          {(fids || []).map((f) => (
            <option key={f.id} value={f.id}>
              {f.id}
              {f.name ? ` — ${f.name}` : ""}
            </option>
          ))}
        </select>
        {(fids || []).length === 0 && (
          <div className="arch-rail-hint">
            No master loaded — load it from the 📥 Inputs tab to bind FIDs.
          </div>
        )}
      </label>

      <label className="arch-field">
        <span>Link to page</span>
        <div className="arch-field-inline">
          <select
            value={data.linkToPage || ""}
            disabled={locked}
            onChange={(e) => onChange({ linkToPage: e.target.value || null })}
          >
            <option value="">— none —</option>
            {(pages || [])
              .filter((p) => p.id !== currentPageId)
              .map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
          </select>
          {linkedPage && (
            <button
              type="button"
              className="arch-btn"
              onClick={() => onOpenLinkedPage(linkedPage.id)}
              title={`Jump to "${linkedPage.name}"`}
            >
              ↗
            </button>
          )}
        </div>
      </label>

      <label className="arch-field">
        <span>Link to object</span>
        <div className="arch-field-inline">
          <select
            value={
              data.linkToObject
                ? `${data.linkToObject.page_id}|${data.linkToObject.object_id}`
                : ""
            }
            disabled={locked}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) onChange({ linkToObject: null });
              else {
                const [pid, oid] = v.split("|");
                onChange({ linkToObject: { page_id: pid, object_id: oid } });
              }
            }}
          >
            <option value="">— none —</option>
            {(allPages || []).flatMap((p) =>
              (p.objects || [])
                .filter(
                  (o) =>
                    o.type !== "edge" &&
                    !(p.page_id === currentPageId && o.id === selected.id)
                )
                .map((o) => (
                  <option
                    key={`${p.page_id}|${o.id}`}
                    value={`${p.page_id}|${o.id}`}
                  >
                    {p.name} · {o.label || o.id}
                  </option>
                ))
            )}
          </select>
          {data.linkToObject && (
            <button
              type="button"
              className="arch-btn"
              onClick={() => onOpenLinkedObject(data.linkToObject)}
              title="Jump to linked object"
            >
              ↗
            </button>
          )}
        </div>
      </label>

      <div className="arch-field">
        <span>Attachments</span>
        {attach ? (
          <div className="arch-attach-summary">
            📎 {attach.count} revision{attach.count > 1 ? "s" : ""}
            <div className="arch-attach-latest" title={attach.latest_filename}>
              latest: <code>{attach.latest_filename}</code>
            </div>
          </div>
        ) : (
          <div className="arch-attach-summary arch-attach-empty">
            No attachments yet
          </div>
        )}
        <div className="arch-rail-hint">
          Use the <b>Attachments</b> panel below the canvas to upload or
          download revisions.
        </div>
      </div>

      <div className="arch-field-row">
        <button
          className="arch-btn arch-btn-danger"
          disabled={locked}
          onClick={onDelete}
        >
          🗑 Delete
        </button>
      </div>

      <div className="arch-rail-hint">
        ID: <code>{selected.id}</code>
      </div>
    </div>
  );
}
