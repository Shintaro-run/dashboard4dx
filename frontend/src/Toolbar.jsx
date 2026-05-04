import React, { useEffect, useState } from "react";
import { METRIC_INFO } from "./colorTags.js";
import Menu from "./Menu.jsx";

export default function Toolbar({
  pages,
  currentPageId,
  pageName,
  navDepth,
  locked,
  tooltips,
  overlayOn,
  overlayMetrics,
  overlayAvailable,
  diffActive,
  diffLabelA,
  diffLabelB,
  onSwitchPage,
  onNavigateBack,
  onCreatePage,
  onRenamePage,
  onDeletePage,
  onAddBox,
  onAddText,
  onTidy,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onToggleLock,
  onToggleOverlay,
  onToggleOverlayMetric,
  onTakeSnapshot,
  onOpenSearch,
  onOpenMultiLayer,
  onOpenLinkage,
  leftRailOpen,
  rightRailOpen,
  onToggleLeftRail,
  onToggleRightRail,
}) {
  const tt = tooltips || {};
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(pageName);

  useEffect(() => {
    setRenameValue(pageName);
    setRenaming(false);
  }, [pageName, currentPageId]);

  const submitRename = () => {
    const trimmed = (renameValue || "").trim();
    if (trimmed && trimmed !== pageName) onRenamePage(currentPageId, trimmed);
    setRenaming(false);
  };

  const handleNew = () => {
    const name = window.prompt("Name for the new page?", "New page");
    if (name && name.trim()) onCreatePage(name.trim());
  };

  const handleDelete = () => {
    if ((pages || []).length <= 1) {
      window.alert("Can't delete the last page.");
      return;
    }
    if (
      window.confirm(
        `Delete "${pageName}"? Attached files on this page will also be removed.`
      )
    ) {
      onDeletePage(currentPageId);
    }
  };

  const handleSnapshot = () => {
    const label = window.prompt(
      "Label for this snapshot (e.g. 'design review v1'):",
      ""
    );
    if (label !== null) onTakeSnapshot(label || "");
  };

  return (
    <div className="arch-toolbar">
      {/* Left: page navigation. Rename / new / delete collapse into one menu. */}
      <div className="arch-toolbar-section">
        <button
          onClick={onToggleLeftRail}
          className={`arch-btn${leftRailOpen ? " arch-btn-active" : ""}`}
          title={
            leftRailOpen
              ? tt.toggle_left_rail_hide || "Hide left rail"
              : tt.toggle_left_rail_show || "Show left rail"
          }
        >
          {leftRailOpen ? "◀▥" : "▥▶"}
        </button>
        <button
          onClick={onNavigateBack}
          className="arch-btn"
          disabled={navDepth === 0}
          title={tt.back || "Back"}
        >
          ◀
        </button>
        {renaming ? (
          <input
            className="arch-toolbar-rename"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
              if (e.key === "Escape") {
                setRenameValue(pageName);
                setRenaming(false);
              }
            }}
            autoFocus
          />
        ) : (
          <select
            className="arch-toolbar-page-picker"
            value={currentPageId}
            onChange={(e) => onSwitchPage(e.target.value)}
            title={tt.page_picker || "Switch layer page"}
          >
            {(pages || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <Menu
          label="⋯"
          title={tt.page_actions || "Page actions"}
          align="left"
        >
          {({ close }) => (
            <>
              <button
                className="arch-menu-item"
                title={tt.rename_page || ""}
                onClick={() => {
                  setRenaming(true);
                  close();
                }}
              >
                ✏ Rename current page
              </button>
              <button
                className="arch-menu-item"
                title={tt.new_page || ""}
                onClick={() => {
                  handleNew();
                  close();
                }}
              >
                ➕ New page…
              </button>
              <div className="arch-menu-divider" />
              <button
                className="arch-menu-item arch-menu-item-danger"
                title={tt.delete_page || ""}
                onClick={() => {
                  handleDelete();
                  close();
                }}
              >
                🗑 Delete current page
              </button>
            </>
          )}
        </Menu>
      </div>

      {diffActive && (
        <div className="arch-toolbar-diff-banner">
          🔍 Diff: <b>{diffLabelA}</b> ↔ <b>{diffLabelB}</b> — read-only
        </div>
      )}

      {/* Right: drawing primaries + a More menu for everything else. */}
      <div className="arch-toolbar-section">
        <button
          onClick={onAddBox}
          disabled={locked}
          className="arch-btn"
          title={tt.add_box || "Add a box"}
        >
          ➕ Box
        </button>
        <button
          onClick={onAddText}
          disabled={locked}
          className="arch-btn"
          title={tt.add_text || "Add a free text label"}
        >
          ➕ Text
        </button>
        <button
          onClick={onTidy}
          disabled={locked}
          className="arch-btn"
          title={tt.tidy || "Auto-arrange the layout"}
        >
          ✨ Tidy
        </button>
        <button
          onClick={onUndo}
          disabled={locked || !canUndo}
          className="arch-btn"
          title={tt.undo || "Undo"}
        >
          ↶
        </button>
        <button
          onClick={onRedo}
          disabled={locked || !canRedo}
          className="arch-btn"
          title={tt.redo || "Redo"}
        >
          ↷
        </button>
        <button
          onClick={onToggleLock}
          className={`arch-btn${locked ? " arch-btn-active" : ""}`}
          title={locked ? (tt.lock_locked || "Click to unlock") : (tt.lock_unlocked || "Click to lock")}
        >
          {locked ? "🔒 Locked" : "🔓 Unlocked"}
        </button>
        <Menu
          label="⋯ More"
          title={tt.more_menu || "More tools"}
          align="right"
        >
          {({ close }) => (
            <>
              <button
                className="arch-menu-item"
                title={tt.search || ""}
                onClick={() => {
                  onOpenSearch();
                  close();
                }}
              >
                🔍 Search
                <span className="arch-menu-shortcut">⌘F</span>
              </button>
              <button
                className="arch-menu-item"
                title={tt.multi_layer || ""}
                onClick={() => {
                  onOpenMultiLayer();
                  close();
                }}
              >
                🌐 Multi-layer view
              </button>
              <button
                className="arch-menu-item"
                title={tt.linkage || ""}
                onClick={() => {
                  onOpenLinkage();
                  close();
                }}
              >
                🕸 Linkage view
              </button>
              <div className="arch-menu-divider" />
              <div className="arch-menu-section">
                <label
                  className={`arch-menu-toggle${
                    overlayAvailable ? "" : " disabled"
                  }`}
                  title={tt.overlay_toggle || "Colour by metric"}
                >
                  <input
                    type="checkbox"
                    checked={overlayOn}
                    disabled={!overlayAvailable}
                    onChange={(e) => onToggleOverlay(e.target.checked)}
                  />
                  <span>📊 Status overlay</span>
                </label>
                {overlayOn && overlayAvailable && (
                  <div className="arch-menu-metrics-list">
                    {Object.entries(METRIC_INFO).map(([k, m]) => (
                      <label key={k} className="arch-menu-metric-row">
                        <input
                          type="checkbox"
                          checked={(overlayMetrics || new Set()).has(k)}
                          onChange={(e) =>
                            onToggleOverlayMetric(k, e.target.checked)
                          }
                        />
                        <span className="arch-menu-metric-name">{m.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </Menu>
        <button
          onClick={onToggleRightRail}
          className={`arch-btn${rightRailOpen ? " arch-btn-active" : ""}`}
          title={
            rightRailOpen
              ? tt.toggle_right_rail_hide || "Hide right rail"
              : tt.toggle_right_rail_show || "Show right rail"
          }
        >
          {rightRailOpen ? "▥▶" : "◀▥"}
        </button>
      </div>
    </div>
  );
}
