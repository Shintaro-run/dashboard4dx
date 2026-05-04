"""
arch.py — Architecture tab for dashboard4dx.

Renders the new "Architecture / アーキテクチャ" tab. The tab body is a single
custom Streamlit component (frontend/dist/) built from React + React Flow,
plus a Streamlit-native attachments panel rendered below the canvas.

Phases shipped:
- Phase 0: tab skeleton, empty React Flow canvas, auto-save round-trip
- Phase 1: boxes / edges / system stamps / inspector / colour tags / lock
- Phase 2: multiple pages with graph navigation (page picker, breadcrumb /
  back-stack, create / rename / delete), per-object link-to-page, file
  attachments with revision history (download / upload).

Storage layout (under input/architecture/, all gitignored):

    pages_index.json                  list of page ids + display names + lock state
    pages/<page_id>/
        current.json                  live state, overwritten on every auto-save
        snapshots/                    deliberate checkpoints (Phase 4)
        attachments/<object_id>/      revisioned attachments (Phase 2)
            <YYYYMMDDhhmmss>__<original_name>
    flows/<flow_id>.json              data flow animations (Phase 8)
"""

from __future__ import annotations

import base64
import datetime as _dt
import io
import json
import mimetypes
import os
import re
import shutil
import uuid
import zipfile
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st
import streamlit.components.v1 as components

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_PROJECT_ROOT = Path(__file__).resolve().parent
_FRONTEND_DIST = _PROJECT_ROOT / "frontend" / "dist"
_ARCH_ROOT = _PROJECT_ROOT / "input" / "architecture"
_PAGES_DIR = _ARCH_ROOT / "pages"
_FLOWS_DIR = _ARCH_ROOT / "flows"
_INDEX_FILE = _ARCH_ROOT / "pages_index.json"
_STAMPS_ROOT = _PROJECT_ROOT / "resources" / "stamps"

DEFAULT_PAGE_ID = "p_root"
DEFAULT_PAGE_NAME = "Root"
SCHEMA_VERSION = 1

# ---------------------------------------------------------------------------
# Session-state keys
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Tooltip strings — surfaced on hover in the language the user picked at the
# top of the page (st.session_state.lang). Keys mirror the React component's
# tooltip prop and the Streamlit popover help= parameters below.
# ---------------------------------------------------------------------------

_ARCH_TOOLTIPS: dict[str, dict[str, str]] = {
    "back": {
        "en": "Back to the previous page (history navigation)",
        "ja": "直前に開いていたページに戻る",
    },
    "page_picker": {
        "en": "Switch layer page",
        "ja": "レイヤページを切り替え",
    },
    "page_actions": {
        "en": "Page actions: rename, new, delete",
        "ja": "ページ操作：名前変更・新規追加・削除",
    },
    "rename_page": {
        "en": "Rename the current page",
        "ja": "現在のページ名を変更",
    },
    "new_page": {
        "en": "Create a new empty layer page",
        "ja": "新しい空のレイヤページを追加",
    },
    "delete_page": {
        "en": "Delete the current page (with confirmation)",
        "ja": "現在のページを削除（確認あり）",
    },
    "add_box": {
        "en": "Add a labelled box at the canvas centre",
        "ja": "ラベル付きボックスをキャンバス中央に追加",
    },
    "add_text": {
        "en": "Add a free text label (can overlap other objects)",
        "ja": "自由テキストラベルを追加（他のオブジェクトに重ねて配置可能）",
    },
    "lock_locked": {
        "en": "Page is locked — click to unlock and resume editing",
        "ja": "ページはロック中 — クリックして編集を再開",
    },
    "lock_unlocked": {
        "en": "Click to lock the page (canvas becomes read-only)",
        "ja": "クリックでページをロック（キャンバスが読み取り専用に）",
    },
    "more_menu": {
        "en": "More tools — search, 3D / linkage views, snapshot, overlay",
        "ja": "その他 — 検索・3Dビュー・リンクグラフ・スナップショット・オーバーレイ",
    },
    "toggle_left_rail_hide": {
        "en": "Hide the left rail (FIDs / flows / stamps) for more canvas space",
        "ja": "左パネル（FID / フロー / スタンプ）を隠してキャンバスを広げる",
    },
    "toggle_left_rail_show": {
        "en": "Show the left rail (FIDs / flows / stamps)",
        "ja": "左パネル（FID / フロー / スタンプ）を表示",
    },
    "toggle_right_rail_hide": {
        "en": "Hide the right rail (inspector / flow editor) for more canvas space",
        "ja": "右パネル（インスペクター / フロー編集）を隠してキャンバスを広げる",
    },
    "toggle_right_rail_show": {
        "en": "Show the right rail (inspector / flow editor)",
        "ja": "右パネル（インスペクター / フロー編集）を表示",
    },
    "node_link_jump": {
        "en": "Click to jump to the linked page",
        "ja": "クリックでリンク先のページへ移動",
    },
    "node_obj_link_jump": {
        "en": "Click to jump to the linked object (opens that page and selects it)",
        "ja": "クリックでリンク先のオブジェクトへ移動（ページを開いて選択）",
    },
    "tidy": {
        "en": "Auto-arrange the boxes / stamps / edges on this page (text annotations are left in place)",
        "ja": "ページ上のボックス・スタンプ・矢印を自動レイアウト（テキスト注釈はそのまま）",
    },
    "undo": {
        "en": "Undo last edit (⌘Z / Ctrl+Z)",
        "ja": "直前の編集を元に戻す（⌘Z / Ctrl+Z）",
    },
    "redo": {
        "en": "Redo (⌘⇧Z / Ctrl+Shift+Z)",
        "ja": "やり直す（⌘⇧Z / Ctrl+Shift+Z）",
    },
    "search": {
        "en": "Search every page by label, FID, attached filename, or tag (⌘F)",
        "ja": "全ページからラベル・FID・添付ファイル名・タグで検索（⌘F）",
    },
    "multi_layer": {
        "en": "Multi-layer 3D view of every page (read-only)",
        "ja": "全ページの3D階層ビュー（読み取り専用）",
    },
    "linkage": {
        "en": "Force-directed graph of links across pages (read-only)",
        "ja": "ページ間リンクのフォースダイレクトグラフ（読み取り専用）",
    },
    "take_snapshot": {
        "en": "Save the current page as a labelled snapshot for diffing later",
        "ja": "現在のページをラベル付きスナップショットとして保存（後で差分比較）",
    },
    "overlay_toggle": {
        "en": "Colour FID-bound nodes by the selected metric (progress / risk / etc.)",
        "ja": "選択メトリクス（進捗・リスク等）でFID紐付きノードを色分け",
    },
    "popover_snapshots": {
        "en": "Per-page snapshot history and diff comparison",
        "ja": "ページ単位のスナップショット履歴と差分比較",
    },
    "popover_housekeeping": {
        "en": "Detect unreachable pages, dangling page links, orphan attachments",
        "ja": "到達不能ページ・リンク切れ・孤立添付ファイルを検出",
    },
    "popover_import_export": {
        "en": "Bundle the whole architecture as a .zip, or import a saved bundle",
        "ja": "アーキテクチャ全体をzipバンドルとして書き出し／取り込み",
    },
    "popover_new": {
        "en": "Wipe the current architecture and start fresh (with backup prompt)",
        "ja": "現在のアーキテクチャを破棄して新規作成（バックアップを促します）",
    },
    "popover_sample": {
        "en": "Install the bundled sample architecture (clears existing data)",
        "ja": "同梱のサンプルアーキテクチャを取り込み（既存データを上書き）",
    },
}


def _arch_lang() -> str:
    lang = st.session_state.get("lang", "ja") if hasattr(st, "session_state") else "ja"
    return "en" if lang == "en" else "ja"


def _arch_tooltips() -> dict[str, str]:
    lang = _arch_lang()
    return {k: v.get(lang, v.get("en", "")) for k, v in _ARCH_TOOLTIPS.items()}


_SS_CURRENT_PAGE = "arch_current_page_id"
_SS_NAV_HISTORY = "arch_nav_history"
_SS_PROCESSED_EVENTS = "arch_processed_events"
_SS_SELECTED_ID = "arch_selected_id"
_SS_LAST_SAVE = "arch_last_save_ts"
_SS_DIFF_MODE = "arch_diff_mode"


def _ss_get(key: str, default: Any) -> Any:
    if key not in st.session_state:
        st.session_state[key] = default
    return st.session_state[key]


# ---------------------------------------------------------------------------
# Layout bootstrap
# ---------------------------------------------------------------------------

def _ensure_layout() -> None:
    _PAGES_DIR.mkdir(parents=True, exist_ok=True)
    _FLOWS_DIR.mkdir(parents=True, exist_ok=True)
    if not _INDEX_FILE.exists():
        _write_index({"pages": [{"id": DEFAULT_PAGE_ID, "name": DEFAULT_PAGE_NAME, "locked": False}]})
    if not _page_file(DEFAULT_PAGE_ID).exists():
        _write_page(DEFAULT_PAGE_ID, _empty_page(DEFAULT_PAGE_ID, DEFAULT_PAGE_NAME))


# ---------------------------------------------------------------------------
# Index + page I/O
# ---------------------------------------------------------------------------

def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def _write_json_atomic(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def _read_index() -> dict:
    return _read_json(_INDEX_FILE, {"pages": []})


def _write_index(idx: dict) -> None:
    _write_json_atomic(_INDEX_FILE, idx)


def _page_dir(page_id: str) -> Path:
    return _PAGES_DIR / page_id


def _page_file(page_id: str) -> Path:
    return _page_dir(page_id) / "current.json"


def _empty_page(page_id: str, name: str) -> dict:
    return {
        "page_id": page_id,
        "name": name,
        "schema_version": SCHEMA_VERSION,
        "locked": False,
        "objects": [],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    }


def _read_page(page_id: str) -> dict:
    return _read_json(_page_file(page_id), _empty_page(page_id, page_id))


def _write_page(page_id: str, payload: dict) -> None:
    payload.setdefault("page_id", page_id)
    payload.setdefault("schema_version", SCHEMA_VERSION)
    _write_json_atomic(_page_file(page_id), payload)


# ---------------------------------------------------------------------------
# Page CRUD
# ---------------------------------------------------------------------------

def _new_page_id() -> str:
    return f"p_{uuid.uuid4().hex[:8]}"


def _create_page(name: str) -> str:
    pid = _new_page_id()
    idx = _read_index()
    idx.setdefault("pages", []).append({"id": pid, "name": name, "locked": False})
    _write_index(idx)
    _write_page(pid, _empty_page(pid, name))
    return pid


def _rename_page(page_id: str, new_name: str) -> None:
    idx = _read_index()
    for p in idx.get("pages", []):
        if p["id"] == page_id:
            p["name"] = new_name
            break
    _write_index(idx)
    page = _read_page(page_id)
    page["name"] = new_name
    _write_page(page_id, page)


def _delete_page(page_id: str) -> bool:
    """Remove a page and its files. Refuses to delete the only remaining page.
    Returns True on success."""
    idx = _read_index()
    pages = idx.get("pages", [])
    if len(pages) <= 1:
        return False
    idx["pages"] = [p for p in pages if p["id"] != page_id]
    _write_index(idx)
    pdir = _page_dir(page_id)
    if pdir.exists():
        shutil.rmtree(pdir, ignore_errors=True)
    # Drop dangling links from every other page that pointed at us.
    for p in idx["pages"]:
        page_data = _read_page(p["id"])
        changed = False
        for obj in page_data.get("objects", []):
            if obj.get("link_to_page") == page_id:
                obj["link_to_page"] = None
                changed = True
        if changed:
            _write_page(p["id"], page_data)
    return True


# ---------------------------------------------------------------------------
# Stamps registry
# ---------------------------------------------------------------------------

def _load_stamps() -> dict[str, list[dict]]:
    """Read all SVG files under resources/stamps/<category>/.

    Returns:
        { "<category>": [ {"id": "<basename>", "label": "<Title Case>",
                           "svg": "<file contents>"}, ... ] }

    Categories with no readable SVGs are omitted. The frontend renders the
    palette directly from this dict, which means dropping a new SVG into the
    folder makes it available next session — no code change needed.
    """
    out: dict[str, list[dict]] = {}
    if not _STAMPS_ROOT.exists():
        return out
    for cat_dir in sorted(_STAMPS_ROOT.iterdir()):
        if not cat_dir.is_dir():
            continue
        items: list[dict] = []
        for svg_path in sorted(cat_dir.glob("*.svg")):
            try:
                items.append({
                    "id": svg_path.stem,
                    "label": svg_path.stem.replace("_", " ").title(),
                    "svg": svg_path.read_text(encoding="utf-8"),
                })
            except OSError:
                continue
        if items:
            out[cat_dir.name] = items
    return out


# ---------------------------------------------------------------------------
# Attachments — revisioned, on disk
# ---------------------------------------------------------------------------

def _attachment_root(page_id: str, object_id: str) -> Path:
    return _page_dir(page_id) / "attachments" / object_id


def _save_attachment(page_id: str, object_id: str, name: str, data: bytes) -> str:
    """Write a new attachment revision. Returns the on-disk filename.

    Timestamp uses microsecond precision (20-char prefix) so two saves within
    the same second don't clash. _list_attachments parses both 14-char (older)
    and 20-char prefixes for backward compatibility."""
    root = _attachment_root(page_id, object_id)
    root.mkdir(parents=True, exist_ok=True)
    ts = _dt.datetime.now().strftime("%Y%m%d%H%M%S%f")
    safe = name.replace("/", "_").replace("\\", "_") or "untitled"
    fname = f"{ts}__{safe}"
    (root / fname).write_bytes(data)
    return fname


def _list_attachments(page_id: str, object_id: str) -> list[dict]:
    root = _attachment_root(page_id, object_id)
    if not root.exists():
        return []
    out = []
    for p in sorted(root.iterdir(), key=lambda x: x.name, reverse=True):
        if not p.is_file():
            continue
        stem = p.name
        if "__" in stem:
            ts_part, original = stem.split("__", 1)
        else:
            ts_part, original = "", stem
        ts_display = "—"
        for fmt in ("%Y%m%d%H%M%S%f", "%Y%m%d%H%M%S"):
            try:
                ts_display = _dt.datetime.strptime(ts_part, fmt).strftime("%Y-%m-%d %H:%M:%S")
                break
            except ValueError:
                continue
        out.append({
            "full_filename": p.name,
            "original_name": original,
            "timestamp": ts_display,
            "ts_part": ts_part,
            "size": p.stat().st_size,
            "path": str(p),
        })
    return out


# ---------------------------------------------------------------------------
# Snapshots — per-page deliberate checkpoints
# ---------------------------------------------------------------------------

def _snapshots_dir(page_id: str) -> Path:
    return _page_dir(page_id) / "snapshots"


def _sanitize_label(label: str) -> str:
    safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in (label or "").strip())
    return safe[:80] or "untitled"


def _create_snapshot(page_id: str, label: str) -> str:
    """Write a snapshot file capturing the current page state and the list of
    attachment revisions that exist right now (frozen-by-reference)."""
    d = _snapshots_dir(page_id)
    d.mkdir(parents=True, exist_ok=True)
    ts = _dt.datetime.now().strftime("%Y%m%d%H%M%S")
    safe_label = _sanitize_label(label or "untitled")
    fname = f"{ts}__{safe_label}.json"

    page_state = _read_page(page_id)

    frozen: dict[str, list[str]] = {}
    page_attach_dir = _page_dir(page_id) / "attachments"
    if page_attach_dir.exists():
        for obj_dir in page_attach_dir.iterdir():
            if obj_dir.is_dir():
                files = sorted(p.name for p in obj_dir.iterdir() if p.is_file())
                if files:
                    frozen[obj_dir.name] = files

    snapshot = {
        "snapshot_id": uuid.uuid4().hex[:12],
        "page_id": page_id,
        "label": label or "",
        "created_at": _dt.datetime.now().isoformat(timespec="seconds"),
        "page_state": page_state,
        "frozen_attachments": frozen,
    }
    _write_json_atomic(d / fname, snapshot)
    return fname


def _list_snapshots(page_id: str) -> list[dict]:
    d = _snapshots_dir(page_id)
    if not d.exists():
        return []
    out = []
    for p in sorted(d.glob("*.json"), key=lambda x: x.name, reverse=True):
        stem = p.stem
        if "__" in stem:
            ts_part, label = stem.split("__", 1)
        else:
            ts_part, label = stem, ""
        try:
            ts_dt = _dt.datetime.strptime(ts_part, "%Y%m%d%H%M%S")
            ts_display = ts_dt.strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            ts_display = "—"
        out.append({
            "filename": p.name,
            "timestamp": ts_display,
            "ts_part": ts_part,
            "label": label.replace("_", " "),
        })
    return out


def _read_snapshot(page_id: str, filename: str) -> dict | None:
    p = _snapshots_dir(page_id) / filename
    if not p.exists():
        return None
    return _read_json(p, None)


def _delete_snapshot(page_id: str, filename: str) -> bool:
    p = _snapshots_dir(page_id) / filename
    if p.exists():
        p.unlink()
        return True
    return False


def _attachment_referenced_in_snapshots(
    page_id: str, object_id: str, full_filename: str
) -> list[str]:
    refs: list[str] = []
    for snap in _list_snapshots(page_id):
        snap_data = _read_snapshot(page_id, snap["filename"])
        if not snap_data:
            continue
        frozen = (snap_data.get("frozen_attachments") or {}).get(object_id, [])
        if full_filename in frozen:
            refs.append(snap["filename"])
    return refs


def _delete_attachment_file(page_id: str, object_id: str, full_filename: str) -> bool:
    p = _attachment_root(page_id, object_id) / full_filename
    if p.exists():
        p.unlink()
        return True
    return False


# ---------------------------------------------------------------------------
# Attachments summary
# ---------------------------------------------------------------------------

def _attachments_summary_for_page(page_id: str) -> dict[str, dict]:
    """{object_id: {"count": N, "latest_filename": "<name>"}} for objects on
    this page that have any attachments. Driven by directory listing — does
    not require the object to still exist in current.json (orphan-tolerant)."""
    page_attach_dir = _page_dir(page_id) / "attachments"
    if not page_attach_dir.exists():
        return {}
    out: dict[str, dict] = {}
    for obj_dir in page_attach_dir.iterdir():
        if not obj_dir.is_dir():
            continue
        files = [p for p in obj_dir.iterdir() if p.is_file()]
        if not files:
            continue
        latest = max(files, key=lambda p: p.name)
        out[obj_dir.name] = {
            "count": len(files),
            "latest_filename": latest.name,
        }
    return out


# ---------------------------------------------------------------------------
# FID master / metrics — pulled from main.py session state via lazy import to
# avoid a circular import (main.py imports this module to render its tab).
# ---------------------------------------------------------------------------

_PCT_LIKE_METRICS = {
    "actual_progress",
    "test_run_rate",
    "test_pass_rate",
    "incident_rate",
    "defect_rate",
}

_OVERLAY_METRICS = (
    "actual_progress",
    "risk_score",
    "test_run_rate",
    "test_pass_rate",
    "incident_rate",
    "defect_rate",
    "delay_days",
)


def _get_fid_master_list() -> list[dict]:
    """Return [{id, name}, ...] from the loaded master, or [] if not loaded."""
    try:
        master = st.session_state.dfs.get("master")
    except (AttributeError, KeyError, TypeError):
        return []
    if master is None or master.empty:
        return []
    if "機能ID" not in master.columns:
        return []
    cols = ["機能ID"] + (["機能名称"] if "機能名称" in master.columns else [])
    seen: set[str] = set()
    out: list[dict] = []
    for _, row in master[cols].iterrows():
        fid = row.get("機能ID")
        if pd.isna(fid):
            continue
        sid = str(fid)
        if sid in seen:
            continue
        seen.add(sid)
        name = row.get("機能名称") if "機能名称" in cols else ""
        out.append({"id": sid, "name": str(name) if pd.notna(name) else ""})
    out.sort(key=lambda r: r["id"])
    return out


def _get_fid_metrics() -> dict[str, dict[str, float]]:
    """Return {fid: {metric: value}} for the live-status overlay.

    Pulled from main.get_current_kpi_df(); returns {} if the master or other
    inputs are not loaded. Percent-like metrics in 0–100 form are scaled
    down to 0–1 so the frontend overlay can colour them uniformly.
    """
    try:
        from main import get_current_kpi_df  # lazy import (see module docstring)
    except Exception:
        return {}
    try:
        kpi_df = get_current_kpi_df()
    except Exception:
        return {}
    if kpi_df is None or kpi_df.empty or "機能ID" not in kpi_df.columns:
        return {}
    available = [c for c in _OVERLAY_METRICS if c in kpi_df.columns]
    if not available:
        return {}
    out: dict[str, dict[str, float]] = {}
    for _, row in kpi_df.iterrows():
        fid = row.get("機能ID")
        if pd.isna(fid):
            continue
        sid = str(fid)
        rec: dict[str, float] = {}
        for c in available:
            v = row.get(c)
            if pd.notna(v):
                f = float(v)
                if c in _PCT_LIKE_METRICS and f > 1.5:
                    f = f / 100.0
                rec[c] = f
        if rec and sid not in out:
            out[sid] = rec
    return out


def _resolve_selected_fid(page_id: str, selected_id: str | None) -> str | None:
    if not selected_id:
        return None
    page = _read_page(page_id)
    for obj in page.get("objects", []):
        if obj.get("id") == selected_id:
            fid = obj.get("fid")
            return str(fid) if fid else None
    return None


def _render_drilldown_panel_if_fid(fid: str) -> None:
    """Embed main.render_drilldown_panel() when an FID-bound object is selected."""
    try:
        from main import get_current_kpi_df, render_drilldown_panel
    except Exception:
        return
    try:
        kpi_df = get_current_kpi_df()
    except Exception:
        return
    if kpi_df is None or kpi_df.empty or "機能ID" not in kpi_df.columns:
        return
    if not (kpi_df["機能ID"].astype(str) == fid).any():
        st.markdown("---")
        st.caption(
            f"ℹ️ FID `{fid}` is not present in the loaded master/KPI data — "
            f"drilldown unavailable."
        )
        return
    defects_df = None
    try:
        defects_df = st.session_state.dfs.get("defects")
    except (AttributeError, KeyError, TypeError):
        pass

    # Per-FID minimize state. The "—" button rendered inside
    # render_drilldown_panel (in place of the usual ✕ close) flips this on.
    min_key = f"arch_drilldown_min__{fid}"
    minimized = st.session_state.get(min_key, False)

    st.markdown("---")
    if minimized:
        cols = st.columns([10, 1])
        cols[0].caption(f"🦖 ドリルダウン `{fid}` (最小化中) — ➕ で展開")
        if cols[1].button(
            "➕",
            key=f"arch_drill_expand__{fid}",
            help="ドリルダウンを展開",
            use_container_width=True,
        ):
            st.session_state[min_key] = False
            st.rerun()
        return

    def _minimize() -> None:
        st.session_state[min_key] = True

    render_drilldown_panel(
        kpi_df,
        defects_df,
        fid,
        close_label="—",
        close_help="ドリルダウンを最小化 / Minimize drilldown",
        on_close=_minimize,
    )


# ---------------------------------------------------------------------------
# Discovery — global search index + housekeeping detectors (Phase 6)
# ---------------------------------------------------------------------------

def _build_search_index() -> list[dict]:
    """Flat searchable list across all pages. Each row carries the fields we
    let users grep against: label, FID, page_name, color_tag, stamp_id, and
    attachment filenames. Edges are included too (they're linkable just like
    boxes/stamps)."""
    out: list[dict] = []
    for p in _read_index().get("pages", []):
        page_data = _read_page(p["id"])
        for obj in page_data.get("objects", []):
            object_id = obj.get("id")
            if not object_id:
                continue
            attach_files = [
                a["original_name"]
                for a in _list_attachments(p["id"], object_id)
            ]
            out.append({
                "page_id": p["id"],
                "page_name": p["name"],
                "object_id": object_id,
                "kind": obj.get("type"),
                "label": obj.get("label", "") or "",
                "fid": obj.get("fid"),
                "color_tag": obj.get("color_tag"),
                "stamp_id": obj.get("stamp_id"),
                "link_to_page": obj.get("link_to_page"),
                "attachment_files": attach_files,
            })
    return out


def _find_dangling_links() -> list[dict]:
    """Objects whose link_to_page references a page that no longer exists."""
    valid_ids = {p["id"] for p in _read_index().get("pages", [])}
    out: list[dict] = []
    for p in _read_index().get("pages", []):
        page_data = _read_page(p["id"])
        for obj in page_data.get("objects", []):
            link = obj.get("link_to_page")
            if link and link not in valid_ids:
                out.append({
                    "page_id": p["id"],
                    "page_name": p["name"],
                    "object_id": obj.get("id"),
                    "label": obj.get("label", ""),
                    "broken_target": link,
                })
    return out


def _find_unreachable_pages() -> list[dict]:
    """Pages with zero inbound link_to_page references. The first page in
    pages_index.json is treated as the conventional entry point and is
    always considered reachable."""
    pages = _read_index().get("pages", [])
    if not pages:
        return []
    entry_id = pages[0]["id"]
    targeted: set[str] = set()
    for p in pages:
        page_data = _read_page(p["id"])
        for obj in page_data.get("objects", []):
            link = obj.get("link_to_page")
            if link:
                targeted.add(link)
    out: list[dict] = []
    for p in pages:
        if p["id"] == entry_id:
            continue
        if p["id"] not in targeted:
            out.append({"page_id": p["id"], "page_name": p["name"]})
    return out


# ---------------------------------------------------------------------------
# Data Flow Animation — Phase 8
# ---------------------------------------------------------------------------

def _list_flows() -> list[dict]:
    if not _FLOWS_DIR.exists():
        return []
    out: list[dict] = []
    for p in sorted(_FLOWS_DIR.glob("*.json")):
        d = _read_json(p, None)
        if d:
            out.append(d)
    return out


def _read_flow(flow_id: str) -> dict | None:
    return _read_json(_FLOWS_DIR / f"{flow_id}.json", None)


def _write_flow(flow_id: str, payload: dict) -> None:
    _write_json_atomic(_FLOWS_DIR / f"{flow_id}.json", payload)


def _create_flow(name: str, color: str) -> str:
    fid = f"f_{uuid.uuid4().hex[:8]}"
    payload = {
        "id": fid,
        "name": name or "New flow",
        "color": color or "#3b82f6",
        "start": None,
        "stops": [],
        "end": None,
    }
    _write_flow(fid, payload)
    return fid


def _delete_flow(flow_id: str) -> bool:
    p = _FLOWS_DIR / f"{flow_id}.json"
    if p.exists():
        p.unlink()
        return True
    return False


def _get_all_pages_data() -> list[dict]:
    """Full per-page object dump used by the Multi-layer + Linkage views.
    Each entry includes a small attachment-count map so view filters can
    surface objects that have files attached."""
    out: list[dict] = []
    for p in _read_index().get("pages", []):
        page_data = _read_page(p["id"])
        attach_counts: dict[str, int] = {}
        attach_dir = _page_dir(p["id"]) / "attachments"
        if attach_dir.exists():
            for obj_dir in attach_dir.iterdir():
                if obj_dir.is_dir():
                    n = sum(1 for q in obj_dir.iterdir() if q.is_file())
                    if n > 0:
                        attach_counts[obj_dir.name] = n
        out.append({
            "page_id": p["id"],
            "name": p["name"],
            "objects": page_data.get("objects", []),
            "attach_counts": attach_counts,
        })
    return out


def _find_orphan_attachments() -> list[dict]:
    """Attachment directories whose object_id is no longer present in the
    page's current.json."""
    out: list[dict] = []
    for p in _read_index().get("pages", []):
        attach_dir = _page_dir(p["id"]) / "attachments"
        if not attach_dir.exists():
            continue
        page_data = _read_page(p["id"])
        live_ids = {obj.get("id") for obj in page_data.get("objects", [])}
        for obj_dir in sorted(attach_dir.iterdir()):
            if not obj_dir.is_dir():
                continue
            if obj_dir.name in live_ids:
                continue
            files = sorted(p2.name for p2 in obj_dir.iterdir() if p2.is_file())
            if not files:
                continue
            total = sum(p2.stat().st_size for p2 in obj_dir.iterdir() if p2.is_file())
            out.append({
                "page_id": p["id"],
                "page_name": p["name"],
                "orphan_object_id": obj_dir.name,
                "files": files,
                "size": total,
            })
    return out


def _human_size(n: int) -> str:
    f = float(n)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if f < 1024 or unit == "TB":
            return f"{f:.0f} {unit}" if unit == "B" else f"{f:.1f} {unit}"
        f /= 1024
    return f"{f:.1f} TB"


# ---------------------------------------------------------------------------
# Component declaration
# ---------------------------------------------------------------------------

_arch_component = components.declare_component(
    "dashboard4dx_architecture",
    path=str(_FRONTEND_DIST),
)


# ---------------------------------------------------------------------------
# Event dispatch
# ---------------------------------------------------------------------------

def _maybe_save_state(state: Any, page_id: str) -> str | None:
    if not isinstance(state, dict):
        return None
    state.setdefault("page_id", page_id)
    state.setdefault("schema_version", SCHEMA_VERSION)
    _write_page(page_id, state)
    return _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _dedupe(event_id: str | None) -> bool:
    """Return True if this event has already been processed (so caller should
    skip). Tracks ids in session state, capped at 200 entries."""
    if not event_id:
        return False
    seen = _ss_get(_SS_PROCESSED_EVENTS, [])
    if event_id in seen:
        return True
    seen.append(event_id)
    if len(seen) > 200:
        del seen[: len(seen) - 200]
    st.session_state[_SS_PROCESSED_EVENTS] = seen
    return False


def _handle_component_value(value: Any, current_page_id: str) -> tuple[str | None, bool]:
    """Process events posted from the iframe. Returns (saved_at, needs_rerun)."""
    if not isinstance(value, dict):
        return None, False
    if _dedupe(value.get("event_id")):
        return None, False

    kind = value.get("kind")
    saved_at: str | None = None
    needs_rerun = False

    # Most events also carry a fresh page_state so the in-flight edits get
    # flushed before the action takes effect.
    state = value.get("page_state")
    if isinstance(state, dict) and state.get("page_id") == current_page_id:
        saved_at = _maybe_save_state(state, current_page_id)

    if kind == "save":
        # Selection may piggy-back here.
        if "selected_id" in value:
            st.session_state[_SS_SELECTED_ID] = value.get("selected_id")

    elif kind == "selection":
        st.session_state[_SS_SELECTED_ID] = value.get("selected_id")
        needs_rerun = True  # update attachments panel

    elif kind == "navigate":
        to = value.get("to_page_id")
        if to and to != current_page_id:
            hist = _ss_get(_SS_NAV_HISTORY, [])
            hist.append(current_page_id)
            st.session_state[_SS_NAV_HISTORY] = hist
            st.session_state[_SS_CURRENT_PAGE] = to
            st.session_state[_SS_SELECTED_ID] = None
            needs_rerun = True

    elif kind == "navigate_back":
        hist = _ss_get(_SS_NAV_HISTORY, [])
        if hist:
            prev = hist.pop()
            st.session_state[_SS_NAV_HISTORY] = hist
            st.session_state[_SS_CURRENT_PAGE] = prev
            st.session_state[_SS_SELECTED_ID] = None
            needs_rerun = True

    elif kind == "navigate_and_select":
        to = value.get("to_page_id")
        sel = value.get("selected_id")
        if to and to != current_page_id:
            hist = _ss_get(_SS_NAV_HISTORY, [])
            hist.append(current_page_id)
            st.session_state[_SS_NAV_HISTORY] = hist
            st.session_state[_SS_CURRENT_PAGE] = to
        if sel:
            st.session_state[_SS_SELECTED_ID] = sel
        needs_rerun = True

    elif kind == "create_page":
        name = (value.get("name") or "Untitled").strip() or "Untitled"
        new_id = _create_page(name)
        hist = _ss_get(_SS_NAV_HISTORY, [])
        hist.append(current_page_id)
        st.session_state[_SS_NAV_HISTORY] = hist
        st.session_state[_SS_CURRENT_PAGE] = new_id
        st.session_state[_SS_SELECTED_ID] = None
        needs_rerun = True

    elif kind == "rename_page":
        pid = value.get("page_id")
        name = (value.get("name") or "").strip()
        if pid and name:
            _rename_page(pid, name)
            needs_rerun = True

    elif kind == "delete_page":
        pid = value.get("page_id")
        if pid and _delete_page(pid):
            if pid == current_page_id:
                idx = _read_index()
                pages = idx.get("pages", [])
                if pages:
                    st.session_state[_SS_CURRENT_PAGE] = pages[0]["id"]
                # Clear back-stack entries pointing at the deleted page.
                hist = _ss_get(_SS_NAV_HISTORY, [])
                hist = [h for h in hist if h != pid]
                st.session_state[_SS_NAV_HISTORY] = hist
                st.session_state[_SS_SELECTED_ID] = None
            needs_rerun = True

    elif kind == "create_snapshot":
        label = (value.get("label") or "").strip()
        _create_snapshot(current_page_id, label)
        needs_rerun = True

    elif kind == "create_flow":
        name = (value.get("name") or "").strip() or "New flow"
        color = value.get("color") or "#3b82f6"
        _create_flow(name, color)
        needs_rerun = True

    elif kind == "update_flow":
        fid = value.get("flow_id")
        if fid:
            existing = _read_flow(fid) or {"id": fid}
            for k in ("name", "color", "start", "stops", "end"):
                if k in value:
                    existing[k] = value[k]
            _write_flow(fid, existing)
            needs_rerun = True

    elif kind == "delete_flow":
        fid = value.get("flow_id")
        if fid:
            _delete_flow(fid)
            needs_rerun = True

    # Switching pages or going back invalidates any active diff (diff is per-page).
    if kind in {"navigate", "navigate_back", "create_page", "delete_page"}:
        if st.session_state.get(_SS_DIFF_MODE):
            st.session_state[_SS_DIFF_MODE] = None

    return saved_at, needs_rerun


# ---------------------------------------------------------------------------
# Streamlit-native attachments panel (rendered below the iframe)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Object descriptions — a long-form, image-embedded memo per object.
# Stored separately from current.json (one descriptions.json per page +
# pages/<page_id>/descriptions/<object_id>/<image-file>) so the iframe's
# debounced auto-save can never clobber a freshly-edited description.
# ---------------------------------------------------------------------------

def _descriptions_file(page_id: str) -> Path:
    return _page_dir(page_id) / "descriptions.json"


def _description_image_dir(page_id: str, object_id: str) -> Path:
    return _page_dir(page_id) / "descriptions" / object_id


_DESC_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}


def _read_descriptions(page_id: str) -> dict:
    return _read_json(_descriptions_file(page_id), {}) or {}


def _write_descriptions(page_id: str, payload: dict) -> None:
    _write_json_atomic(_descriptions_file(page_id), payload)


def _get_description(page_id: str, object_id: str) -> str | None:
    return _read_descriptions(page_id).get(object_id)


def _set_description(page_id: str, object_id: str, desc: str | None) -> None:
    d = _read_descriptions(page_id)
    if desc and desc.strip():
        d[object_id] = desc
    elif object_id in d:
        del d[object_id]
    _write_descriptions(page_id, d)


def _save_description_image(page_id: str, object_id: str, name: str, blob: bytes) -> str:
    root = _description_image_dir(page_id, object_id)
    root.mkdir(parents=True, exist_ok=True)
    ts = _dt.datetime.now().strftime("%Y%m%d%H%M%S%f")
    safe = name.replace("/", "_").replace("\\", "_") or "image"
    fname = f"{ts}_{safe}"
    (root / fname).write_bytes(blob)
    return fname


def _list_description_images(page_id: str, object_id: str) -> list[dict]:
    root = _description_image_dir(page_id, object_id)
    if not root.exists():
        return []
    out = []
    for p in sorted(root.iterdir(), key=lambda x: x.name, reverse=True):
        if not p.is_file():
            continue
        if p.suffix.lower() not in _DESC_IMAGE_EXTS:
            continue
        out.append({"filename": p.name, "size": p.stat().st_size, "path": str(p)})
    return out


_MD_IMG_RE = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")


def _render_description_markdown(page_id: str, object_id: str, desc: str) -> str:
    """Inline-embed every local image reference as a base64 data URI so
    st.markdown can render the description as one continuous narrative."""
    if not desc:
        return ""
    desc_dir = _description_image_dir(page_id, object_id)

    def _replace(match: re.Match) -> str:
        alt = match.group(1)
        src = match.group(2).strip()
        if src.startswith(("http://", "https://", "data:")):
            return match.group(0)
        try:
            img_path = (desc_dir / src).resolve()
            # Refuse anything that escapes the image dir.
            if desc_dir.resolve() not in img_path.parents and img_path.parent != desc_dir.resolve():
                return f"`(image path outside descriptions folder: {src})`"
            if not img_path.exists():
                return f"`(missing image: {src})`"
            mime, _ = mimetypes.guess_type(str(img_path))
            mime = mime or "image/png"
            data = base64.b64encode(img_path.read_bytes()).decode("ascii")
            return f"![{alt}](data:{mime};base64,{data})"
        except OSError:
            return f"`(error loading image: {src})`"

    return _MD_IMG_RE.sub(_replace, desc)


def _render_description_panel(page_id: str, object_id: str) -> None:
    desc = _get_description(page_id, object_id) or ""
    img_count = len(_list_description_images(page_id, object_id))

    min_key = f"arch_desc_min__{page_id}__{object_id}"
    minimized = st.session_state.get(min_key, False)

    st.markdown("---")
    if minimized:
        cols = st.columns([10, 1])
        cols[0].caption(
            f"📝 Description `{object_id}` (最小化中) — ➕ で展開"
        )
        if cols[1].button(
            "➕",
            key=f"arch_desc_expand__{page_id}__{object_id}",
            help="Expand description / 説明を展開",
            use_container_width=True,
        ):
            st.session_state[min_key] = False
            st.rerun()
        return

    title = (
        f"#### 📝 Description — `{object_id}`"
        + (f"  ·  {img_count} image{'s' if img_count != 1 else ''}" if img_count else "")
    )
    head = st.columns([10, 1])
    head[0].markdown(title)
    if head[1].button(
        "—",
        key=f"arch_desc_min_btn__{page_id}__{object_id}",
        help="Minimize / 説明を最小化",
        use_container_width=True,
    ):
        st.session_state[min_key] = True
        st.rerun()

    tab_view, tab_edit = st.tabs(["👁 Preview", "✏ Edit"])

    with tab_view:
        if desc.strip():
            rendered = _render_description_markdown(page_id, object_id, desc)
            st.markdown(rendered, unsafe_allow_html=False)
        else:
            st.caption(
                "No description yet. Switch to the **✏ Edit** tab to write a "
                "long-form memo and embed images."
            )

    with tab_edit:
        text_key = f"arch_desc_text__{page_id}__{object_id}"
        # Streamlit's text_area widget owns the state; pass desc as initial value.
        new_text = st.text_area(
            "Markdown — write freely. Embed images by uploading them below.",
            value=desc,
            height=320,
            key=text_key,
            help=(
                "Standard markdown: **bold**, *italic*, `code`, lists, links, "
                "headings. Images are written as ![alt](filename) — the "
                "uploader below auto-appends the right filename."
            ),
        )
        cols = st.columns([2, 2, 6])
        if cols[0].button("💾 Save", key=f"arch_desc_save__{page_id}__{object_id}"):
            _set_description(page_id, object_id, new_text)
            st.success("Description saved.")
            st.rerun()
        if desc and cols[1].button(
            "🗑 Delete", key=f"arch_desc_del__{page_id}__{object_id}",
            help="Remove this description (image files are kept for your reference).",
        ):
            _set_description(page_id, object_id, None)
            st.rerun()

        st.markdown("**📷 Insert image**")
        st.caption(
            "Pick a PNG / JPG / GIF / WebP. On upload it's saved alongside the "
            "description and a `![alt](filename)` reference is appended to the "
            "current draft (move it wherever you want, then click Save)."
        )
        upload_key = f"arch_desc_img__{page_id}__{object_id}"
        seen_key = f"arch_desc_img_seen__{page_id}__{object_id}"
        uploaded = st.file_uploader(
            "Upload image",
            type=["png", "jpg", "jpeg", "gif", "webp"],
            key=upload_key,
            accept_multiple_files=False,
        )
        if uploaded is not None:
            fp = f"{uploaded.name}__{uploaded.size}"
            if st.session_state.get(seen_key) != fp:
                blob = (
                    uploaded.getbuffer().tobytes()
                    if hasattr(uploaded, "getbuffer")
                    else uploaded.read()
                )
                fname = _save_description_image(page_id, object_id, uploaded.name, blob)
                appended = (new_text or "") + (
                    "\n\n" if (new_text and not new_text.endswith("\n\n")) else ""
                ) + f"![{uploaded.name}]({fname})\n"
                _set_description(page_id, object_id, appended)
                st.session_state[seen_key] = fp
                st.rerun()

        images = _list_description_images(page_id, object_id)
        if images:
            with st.expander(f"📸 Embedded image files ({len(images)})", expanded=False):
                for img in images:
                    cc = st.columns([4, 2, 1])
                    cc[0].code(f"![{img['filename']}]({img['filename']})", language="markdown")
                    cc[1].caption(_human_size(img["size"]))
                    if cc[2].button(
                        "🗑",
                        key=f"arch_desc_imgdel__{page_id}__{object_id}__{img['filename']}",
                        help="Delete this image file (the markdown reference, if any, "
                             "will then render as 'missing image').",
                    ):
                        try:
                            (Path(img["path"])).unlink()
                        except OSError:
                            pass
                        st.rerun()


def _render_attachments_panel(page_id: str, object_id: str) -> None:
    revisions = _list_attachments(page_id, object_id)

    min_key = f"arch_attach_min__{page_id}__{object_id}"
    minimized = st.session_state.get(min_key, False)

    st.markdown("---")
    if minimized:
        cols = st.columns([10, 1])
        cols[0].caption(
            f"📎 Attachments `{object_id}` (最小化中) — ➕ で展開"
            + (f"  ·  {len(revisions)} revision(s)" if revisions else "")
        )
        if cols[1].button(
            "➕",
            key=f"arch_attach_expand__{page_id}__{object_id}",
            help="Expand attachments / 添付を展開",
            use_container_width=True,
        ):
            st.session_state[min_key] = False
            st.rerun()
        return

    head = st.columns([10, 1])
    head[0].markdown(
        f"#### 📎 Attachments — selected object `{object_id}`"
    )
    if head[1].button(
        "—",
        key=f"arch_attach_min_btn__{page_id}__{object_id}",
        help="Minimize / 添付を最小化",
        use_container_width=True,
    ):
        st.session_state[min_key] = True
        st.rerun()

    if revisions:
        for rev in revisions:
            cols = st.columns([5, 3, 1, 1])
            cols[0].markdown(f"**{rev['original_name']}**")
            cols[1].caption(f"{rev['timestamp']} · {_human_size(rev['size'])}")
            try:
                blob = Path(rev["path"]).read_bytes()
            except OSError:
                blob = b""
            cols[2].download_button(
                "⬇",
                data=blob,
                file_name=rev["original_name"],
                key=f"arch_dl__{page_id}__{object_id}__{rev['full_filename']}",
                help="Download this revision",
            )

            del_key = f"arch_del_rev__{page_id}__{object_id}__{rev['full_filename']}"
            confirm_key = f"arch_del_rev_confirm__{page_id}__{object_id}__{rev['full_filename']}"
            if cols[3].button("🗑", key=del_key, help="Delete this revision"):
                refs = _attachment_referenced_in_snapshots(
                    page_id, object_id, rev["full_filename"]
                )
                if refs:
                    st.session_state[confirm_key] = refs
                    st.rerun()
                else:
                    _delete_attachment_file(page_id, object_id, rev["full_filename"])
                    st.rerun()

            pending = st.session_state.get(confirm_key)
            if pending:
                st.warning(
                    f"⚠️ This revision is referenced by {len(pending)} snapshot(s): "
                    f"`{', '.join(pending)}`. Deleting will leave those snapshots "
                    f"with a broken pointer."
                )
                cc = st.columns([1, 1, 5])
                if cc[0].button("Delete anyway", key=f"{confirm_key}__yes"):
                    _delete_attachment_file(page_id, object_id, rev["full_filename"])
                    del st.session_state[confirm_key]
                    st.rerun()
                if cc[1].button("Cancel", key=f"{confirm_key}__no"):
                    del st.session_state[confirm_key]
                    st.rerun()
    else:
        st.caption("No attachments yet for this object.")

    upload_key = f"arch_uploader__{page_id}__{object_id}"
    seen_key = f"arch_uploader_seen__{page_id}__{object_id}"
    uploaded = st.file_uploader(
        "Upload new revision",
        key=upload_key,
        accept_multiple_files=False,
    )
    if uploaded is not None:
        # st.file_uploader retains the value across reruns; gate on a
        # fingerprint so we only write once per actual upload.
        fp = f"{uploaded.name}__{uploaded.size}"
        if st.session_state.get(seen_key) != fp:
            _save_attachment(
                page_id,
                object_id,
                uploaded.name,
                uploaded.getbuffer().tobytes() if hasattr(uploaded, "getbuffer") else uploaded.read(),
            )
            st.session_state[seen_key] = fp
            st.rerun()


# ---------------------------------------------------------------------------
# Snapshots & Diff panel (rendered below the iframe, always visible)
# ---------------------------------------------------------------------------

def _render_snapshots_panel(page_id: str) -> None:
    snaps = _list_snapshots(page_id)
    diff = _ss_get(_SS_DIFF_MODE, None)

    if diff:
        label_b = (
            "current"
            if diff.get("snapshot_b") == "current"
            else diff.get("snapshot_b")
        )
        st.info(
            f"🔍 **Diff mode active.**  "
            f"`{diff.get('snapshot_a')}` ↔ `{label_b}`. "
            f"Canvas is read-only while diff is on."
        )
        if st.button("✕ Exit diff view", key=f"arch_diff_exit__{page_id}"):
            st.session_state[_SS_DIFF_MODE] = None
            st.rerun()
        st.markdown("---")

    # Take a new snapshot — sits at the top of the popover so the action and
    # the snapshot list live in the same place. Counter-keyed so the input
    # clears after each save (Streamlit forbids setting widget-bound state
    # post-render).
    if not diff:
        st.markdown("**📸 Take a snapshot of this page**")
        counter_key = f"arch_snap_counter__{page_id}"
        counter = st.session_state.setdefault(counter_key, 0)
        cols = st.columns([5, 2])
        new_label = cols[0].text_input(
            "Label",
            value="",
            placeholder="e.g. design review v1",
            key=f"arch_snap_label__{page_id}__{counter}",
            label_visibility="collapsed",
        )
        if cols[1].button(
            "📸 Take",
            key=f"arch_snap_take__{page_id}__{counter}",
            use_container_width=True,
        ):
            _create_snapshot(page_id, (new_label or "").strip())
            st.session_state[counter_key] = counter + 1
            st.rerun()
        st.markdown("---")

    if not snaps:
        st.caption("No snapshots yet for this page.")
        return

    st.markdown("**Saved snapshots** (newest first):")
    for snap in snaps:
        cols = st.columns([4, 3, 2, 1])
        cols[0].markdown(f"**{snap['label'] or '(unlabeled)'}**")
        cols[1].caption(snap["timestamp"])
        if cols[2].button(
            "🔍 vs current",
            key=f"arch_diff_curr__{page_id}__{snap['filename']}",
            help=f"Compare this snapshot with the current state",
        ):
            st.session_state[_SS_DIFF_MODE] = {
                "snapshot_a": snap["filename"],
                "snapshot_b": "current",
            }
            st.rerun()
        if cols[3].button(
            "🗑",
            key=f"arch_snap_del__{page_id}__{snap['filename']}",
            help="Delete this snapshot",
        ):
            _delete_snapshot(page_id, snap["filename"])
            if (
                diff
                and (
                    diff.get("snapshot_a") == snap["filename"]
                    or diff.get("snapshot_b") == snap["filename"]
                )
            ):
                st.session_state[_SS_DIFF_MODE] = None
            st.rerun()

    st.markdown("---")
    st.markdown("**Compare two snapshots:**")
    opts = ["— pick —"] + [
        f"{s['label'] or '(unlabeled)'} · {s['timestamp']}" for s in snaps
    ]
    opt_filenames = [None] + [s["filename"] for s in snaps]
    cols = st.columns([4, 4, 2])
    sel_a = cols[0].selectbox(
        "From", opts, key=f"arch_pair_a__{page_id}", label_visibility="collapsed"
    )
    sel_b = cols[1].selectbox(
        "To", opts, key=f"arch_pair_b__{page_id}", label_visibility="collapsed"
    )
    if cols[2].button("Show diff", key=f"arch_pair_show__{page_id}"):
        ia = opts.index(sel_a) if sel_a in opts else 0
        ib = opts.index(sel_b) if sel_b in opts else 0
        if ia > 0 and ib > 0 and ia != ib:
            st.session_state[_SS_DIFF_MODE] = {
                "snapshot_a": opt_filenames[ia],
                "snapshot_b": opt_filenames[ib],
            }
            st.rerun()
        else:
            st.warning("Pick two **different** snapshots.")


def _render_housekeeping_panel() -> None:
    dangling = _find_dangling_links()
    unreachable = _find_unreachable_pages()
    orphans = _find_orphan_attachments()
    total = len(dangling) + len(unreachable) + len(orphans)
    title = (
        f"🧹 Housekeeping ({total} item{'s' if total != 1 else ''})"
        if total
        else "🧹 Housekeeping (clean ✓)"
    )
    if total == 0:
        st.caption(
            "No orphans or dangling references detected — everything's "
            "tidy."
        )
        return

    if unreachable:
        st.markdown(
            "**🚪 Unreachable pages** — no inbound links from any other "
            "page (the first page in the index is the entry point and is "
            "always considered reachable):"
        )
        for u in unreachable:
            cols = st.columns([5, 1])
            cols[0].markdown(f"- **{u['page_name']}** · `{u['page_id']}`")
            if cols[1].button("Open", key=f"hk_open__{u['page_id']}"):
                cur = _ss_get(_SS_CURRENT_PAGE, "")
                if cur and cur != u["page_id"]:
                    hist = _ss_get(_SS_NAV_HISTORY, [])
                    hist.append(cur)
                    st.session_state[_SS_NAV_HISTORY] = hist
                st.session_state[_SS_CURRENT_PAGE] = u["page_id"]
                st.session_state[_SS_SELECTED_ID] = None
                st.rerun()
        st.markdown("")

    if dangling:
        st.markdown(
            "**🔗 Dangling page links** — `link_to_page` points to a "
            "page that no longer exists:"
        )
        for d in dangling:
            cols = st.columns([5, 1])
            cols[0].markdown(
                f"- `{d['object_id']}` "
                f"({d['label'] or '(no label)'}) on **{d['page_name']}** "
                f"→ broken target `{d['broken_target']}`"
            )
            if cols[1].button(
                "Go", key=f"hk_dang__{d['page_id']}__{d['object_id']}"
            ):
                cur = _ss_get(_SS_CURRENT_PAGE, "")
                if cur and cur != d["page_id"]:
                    hist = _ss_get(_SS_NAV_HISTORY, [])
                    hist.append(cur)
                    st.session_state[_SS_NAV_HISTORY] = hist
                st.session_state[_SS_CURRENT_PAGE] = d["page_id"]
                st.session_state[_SS_SELECTED_ID] = d["object_id"]
                st.rerun()
        st.markdown("")

    if orphans:
        st.markdown(
            "**📎 Orphan attachments** — files exist for an object that's "
            "no longer on the page:"
        )
        for o in orphans:
            cols = st.columns([5, 1])
            cols[0].markdown(
                f"- `{o['orphan_object_id']}` on **{o['page_name']}** — "
                f"{len(o['files'])} file(s), {_human_size(o['size'])}"
            )
            if cols[1].button(
                "Delete files",
                key=f"hk_orphan__{o['page_id']}__{o['orphan_object_id']}",
            ):
                obj_dir = (
                    _page_dir(o["page_id"])
                    / "attachments"
                    / o["orphan_object_id"]
                )
                shutil.rmtree(obj_dir, ignore_errors=True)
                st.rerun()


# ---------------------------------------------------------------------------
# Import / Export — the whole architecture as a single .zip bundle
# ---------------------------------------------------------------------------

EXPORT_SCHEMA_VERSION = 1
_MAX_IMPORT_BYTES = 100 * 1024 * 1024
_MAX_EXTRACTED_BYTES = 250 * 1024 * 1024


def _export_architecture_bytes() -> bytes:
    """Bundle the entire input/architecture/ tree (pages_index, every page's
    current.json + snapshots/* + attachments/<obj>/<rev>, every flow) into a
    .zip alongside a small manifest. Result is suitable for st.download_button
    and round-trips cleanly through _import_architecture_bytes()."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        manifest = {
            "schema_version": EXPORT_SCHEMA_VERSION,
            "exported_at": _dt.datetime.now().isoformat(timespec="seconds"),
            "page_count": len(_read_index().get("pages", [])),
            "flow_count": len(_list_flows()),
        }
        z.writestr(
            "manifest.json",
            json.dumps(manifest, indent=2, ensure_ascii=False),
        )
        if _ARCH_ROOT.exists():
            for p in sorted(_ARCH_ROOT.rglob("*")):
                if p.is_file():
                    rel = p.relative_to(_ARCH_ROOT)
                    z.write(p, str(rel))
    return buf.getvalue()


def _import_architecture_bytes(blob: bytes) -> tuple[bool, str]:
    """Validate a zip blob and replace input/architecture/ with its contents.
    Returns (ok, message). Does NOT itself rerun Streamlit; caller should."""
    if len(blob) > _MAX_IMPORT_BYTES:
        return False, f"Import file too large ({_human_size(len(blob))} > 100 MB)."
    try:
        z = zipfile.ZipFile(io.BytesIO(blob), "r")
    except zipfile.BadZipFile:
        return False, "Not a valid zip file."

    try:
        manifest_raw = z.read("manifest.json")
        manifest = json.loads(manifest_raw.decode("utf-8"))
    except (KeyError, json.JSONDecodeError, UnicodeDecodeError):
        return False, "Missing or invalid manifest.json — was this exported from the Architecture tab?"

    schema = manifest.get("schema_version")
    if not isinstance(schema, int):
        return False, "Manifest missing schema_version."
    if schema > EXPORT_SCHEMA_VERSION:
        return (
            False,
            f"Export was made with schema v{schema}; this dashboard only "
            f"understands up to v{EXPORT_SCHEMA_VERSION}. Upgrade the dashboard.",
        )

    # Sanity-check entries: refuse path traversal, cap uncompressed size,
    # require either pages_index.json or pages/ to exist.
    total_size = 0
    has_index = False
    for info in z.infolist():
        name = info.filename.replace("\\", "/")
        parts = Path(name).parts
        if name.startswith("/") or any(part == ".." for part in parts):
            return False, f"Refusing path-traversal entry: {info.filename}"
        total_size += info.file_size
        if total_size > _MAX_EXTRACTED_BYTES:
            return False, "Uncompressed payload exceeds 250 MB."
        if name == "pages_index.json":
            has_index = True
    if not has_index:
        return False, "Bundle has no pages_index.json — bundle is incomplete."

    # Wipe and extract.
    if _ARCH_ROOT.exists():
        shutil.rmtree(_ARCH_ROOT)
    _ARCH_ROOT.mkdir(parents=True, exist_ok=True)

    for info in z.infolist():
        if info.filename == "manifest.json":
            continue
        if info.is_dir():
            continue
        target = _ARCH_ROOT / info.filename
        target.parent.mkdir(parents=True, exist_ok=True)
        with z.open(info) as src, target.open("wb") as dst:
            shutil.copyfileobj(src, dst)

    # Reset transient session state so the freshly-imported architecture is
    # rendered cleanly on first page.
    pages = _read_index().get("pages", [])
    st.session_state[_SS_CURRENT_PAGE] = pages[0]["id"] if pages else DEFAULT_PAGE_ID
    st.session_state[_SS_NAV_HISTORY] = []
    st.session_state[_SS_SELECTED_ID] = None
    st.session_state[_SS_DIFF_MODE] = None
    st.session_state[_SS_PROCESSED_EVENTS] = []

    pc = manifest.get("page_count", "?")
    fc = manifest.get("flow_count", "?")
    return True, f"Imported {pc} page(s), {fc} flow(s)."


# ---------------------------------------------------------------------------
# PDF export — cover · TOC · per-page render · flows summary
# ---------------------------------------------------------------------------

_TAG_HEX = {
    "frontend": "#3b82f6", "backend": "#10b981", "data": "#8b5cf6",
    "external": "#f97316", "infra": "#64748b", "deprecated": "#ef4444",
    "accent": "#ec4899", "neutral": "#94a3b8",
}


def _hex_to_rgb01(s: str | None, fallback: tuple = (0.53, 0.55, 0.59)):
    if not s:
        return fallback
    h = s.lstrip("#")
    if len(h) != 6:
        return fallback
    try:
        return (int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255)
    except ValueError:
        return fallback


_BOX_W, _BOX_H = 160, 56
_STAMP_W, _STAMP_H = 64, 64
_TEXT_W, _TEXT_H = 80, 22


def _obj_dims(obj: dict) -> tuple[float, float]:
    t = obj.get("type")
    if t == "stamp":
        return _STAMP_W, _STAMP_H
    if t == "text":
        return _TEXT_W, _TEXT_H
    return _BOX_W, _BOX_H


def _draw_arch_page(c, page_w: float, page_h: float, page_data: dict, idx: int, total: int) -> None:
    title = page_data.get("name", "Untitled")
    objects = page_data.get("objects", []) or []
    visual = [o for o in objects if o.get("type") != "edge"]

    # Header
    c.setFont("HeiseiKakuGo-W5", 14)
    c.setFillColorRGB(0.1, 0.15, 0.22)
    c.drawString(36, page_h - 36, f"{idx}. {title}")
    c.setFont("HeiseiKakuGo-W5", 9)
    c.setFillColorRGB(0.45, 0.5, 0.55)
    c.drawString(36, page_h - 52, f"Page {idx} of {total} · {len(visual)} object(s)")
    c.setStrokeColorRGB(0.85, 0.87, 0.9)
    c.setLineWidth(0.5)
    c.line(36, page_h - 60, page_w - 36, page_h - 60)

    if not visual:
        c.setFont("HeiseiKakuGo-W5", 12)
        c.setFillColorRGB(0.6, 0.62, 0.66)
        c.drawString(36, page_h / 2, "(empty page)")
        return

    # Bounds
    minx = min(o.get("x", 0) for o in visual)
    miny = min(o.get("y", 0) for o in visual)
    maxx = max(o.get("x", 0) + _obj_dims(o)[0] for o in visual)
    maxy = max(o.get("y", 0) + _obj_dims(o)[1] for o in visual)
    cw = max(maxx - minx, 1)
    ch = max(maxy - miny, 1)

    # Drawing area (below header).
    margin_x = 40
    top = page_h - 80
    bottom = 40
    avail_w = page_w - margin_x * 2
    avail_h = top - bottom
    scale = min(avail_w / cw, avail_h / ch, 1.0)

    # Centred origin inside the drawing area.
    used_w = cw * scale
    used_h = ch * scale
    origin_x = margin_x + (avail_w - used_w) / 2
    origin_y = bottom + (avail_h - used_h) / 2

    def to_pdf(x_canvas: float, y_canvas: float) -> tuple[float, float]:
        # Canvas y grows down; reportlab y grows up — flip.
        return (
            origin_x + (x_canvas - minx) * scale,
            origin_y + (ch - (y_canvas - miny)) * scale,
        )

    # Edges
    obj_map = {o["id"]: o for o in objects if "id" in o}
    c.setStrokeColorRGB(0.55, 0.62, 0.72)
    c.setLineWidth(1.2)
    for e in (o for o in objects if o.get("type") == "edge"):
        a = obj_map.get(e.get("from"))
        b = obj_map.get(e.get("to"))
        if not a or not b:
            continue
        wa, ha = _obj_dims(a)
        wb, hb = _obj_dims(b)
        ax_canvas = a.get("x", 0) + wa / 2
        ay_canvas = a.get("y", 0) + ha / 2
        bx_canvas = b.get("x", 0) + wb / 2
        by_canvas = b.get("y", 0) + hb / 2
        ax, ay = to_pdf(ax_canvas, ay_canvas)
        bx, by = to_pdf(bx_canvas, by_canvas)
        tag = e.get("color_tag")
        link = e.get("link_to_page")
        if tag and tag in _TAG_HEX:
            c.setStrokeColorRGB(*_hex_to_rgb01(_TAG_HEX[tag]))
        elif link:
            c.setStrokeColorRGB(*_hex_to_rgb01("#3b82f6"))
        else:
            c.setStrokeColorRGB(0.55, 0.62, 0.72)
        c.line(ax, ay, bx, by)

    # Nodes
    for o in visual:
        w, h = _obj_dims(o)
        x_pdf, y_top_pdf = to_pdf(o.get("x", 0), o.get("y", 0))
        wp = w * scale
        hp = h * scale
        # Reportlab rect is anchored at lower-left; y_top_pdf is the top edge after flipping.
        rect_y = y_top_pdf - hp
        tag = o.get("color_tag")
        if o.get("type") == "stamp":
            c.setFillColorRGB(*_hex_to_rgb01(_TAG_HEX.get(tag), fallback=(0.95, 0.95, 0.97)))
            c.setStrokeColorRGB(*_hex_to_rgb01(_TAG_HEX.get(tag), fallback=(0.55, 0.6, 0.65)))
            c.circle(x_pdf + wp / 2, rect_y + hp / 2, min(wp, hp) / 2, fill=1, stroke=1)
        elif o.get("type") == "text":
            # Draw as plain text only (no border) so it reads as annotation.
            c.setFillColorRGB(*_hex_to_rgb01(_TAG_HEX.get(tag), fallback=(0.12, 0.16, 0.22)))
            c.setFont("HeiseiKakuGo-W5", max(7, int(11 * scale)))
            c.drawString(x_pdf + 2, rect_y + hp / 2 - 4, (o.get("label") or "").strip())
            continue
        else:
            tag_color = _TAG_HEX.get(tag) if tag else None
            if tag_color:
                fr, fg, fb = _hex_to_rgb01(tag_color)
                # Lightened fill (mix with white).
                c.setFillColorRGB(0.85 + fr * 0.15, 0.85 + fg * 0.15, 0.85 + fb * 0.15)
                c.setStrokeColorRGB(fr, fg, fb)
            else:
                c.setFillColorRGB(1, 1, 1)
                c.setStrokeColorRGB(0.55, 0.6, 0.65)
            c.setLineWidth(1.0)
            c.roundRect(x_pdf, rect_y, wp, hp, 4, fill=1, stroke=1)

        # Label
        label = (o.get("label") or "").strip()
        if label:
            c.setFillColorRGB(0.13, 0.18, 0.24)
            font_size = max(6, int(10 * scale))
            c.setFont("HeiseiKakuGo-W5", font_size)
            # Truncate label if it would overflow.
            avail_text_w = wp - 6
            shown = label
            while shown and c.stringWidth(shown, "HeiseiKakuGo-W5", font_size) > avail_text_w:
                shown = shown[:-1]
            if shown != label and len(shown) > 1:
                shown = shown[:-1] + "…"
            c.drawString(x_pdf + 4, rect_y + hp / 2 - font_size / 3, shown)
        # FID annotation
        fid = o.get("fid")
        if fid:
            c.setFillColorRGB(0.45, 0.5, 0.55)
            fs = max(5, int(7 * scale))
            c.setFont("HeiseiKakuGo-W5", fs)
            c.drawString(x_pdf + 4, rect_y + 2, fid)

    # Page footer
    c.setFont("HeiseiKakuGo-W5", 8)
    c.setFillColorRGB(0.6, 0.65, 0.7)
    c.drawRightString(
        page_w - 36, 24,
        f"dashboard4dx · {_dt.datetime.now().strftime('%Y-%m-%d')}",
    )


def _draw_pdf_cover(c, page_w: float, page_h: float, pages: list[dict], flows: list[dict]) -> None:
    c.setFillColorRGB(0.06, 0.09, 0.16)
    c.rect(0, 0, page_w, page_h, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("HeiseiKakuGo-W5", 32)
    c.drawString(72, page_h - 140, "Architecture Report")
    c.setFont("HeiseiKakuGo-W5", 14)
    c.setFillColorRGB(0.7, 0.78, 0.86)
    c.drawString(72, page_h - 170, _dt.datetime.now().strftime("Generated %Y-%m-%d %H:%M"))
    c.setFont("HeiseiKakuGo-W5", 12)
    c.drawString(72, page_h - 220, f"{len(pages)} layer page(s)")
    c.drawString(72, page_h - 240, f"{len(flows)} data flow(s)")
    c.setFont("HeiseiKakuGo-W5", 10)
    c.setFillColorRGB(0.55, 0.65, 0.78)
    c.drawString(72, 60, "dashboard4dx")


def _draw_pdf_toc(c, page_w: float, page_h: float, pages: list[dict]) -> None:
    c.setFillColorRGB(0.13, 0.16, 0.22)
    c.setFont("HeiseiKakuGo-W5", 22)
    c.drawString(54, page_h - 54, "Contents")
    c.setStrokeColorRGB(0.85, 0.87, 0.9)
    c.line(54, page_h - 64, page_w - 54, page_h - 64)
    c.setFont("HeiseiKakuGo-W5", 12)
    y = page_h - 96
    for i, p in enumerate(pages, 1):
        if y < 60:
            c.showPage()
            c.setFont("HeiseiKakuGo-W5", 12)
            y = page_h - 54
        c.setFillColorRGB(0.12, 0.16, 0.22)
        c.drawString(72, y, f"{i}.  {p.get('name', '?')}")
        c.setFillColorRGB(0.5, 0.55, 0.6)
        c.drawRightString(page_w - 72, y, p.get("id", ""))
        y -= 22


def _draw_pdf_flows(c, page_w: float, page_h: float, flows: list[dict], pages: list[dict]) -> None:
    page_lookup = {p["id"]: p["name"] for p in pages}
    c.setFillColorRGB(0.13, 0.16, 0.22)
    c.setFont("HeiseiKakuGo-W5", 22)
    c.drawString(54, page_h - 54, "Data flows")
    c.setStrokeColorRGB(0.85, 0.87, 0.9)
    c.line(54, page_h - 64, page_w - 54, page_h - 64)

    y = page_h - 96
    for f in flows:
        if y < 100:
            c.showPage()
            y = page_h - 54

        # Coloured pill
        c.setFillColorRGB(*_hex_to_rgb01(f.get("color")))
        c.circle(60, y + 4, 6, fill=1, stroke=0)

        c.setFillColorRGB(0.13, 0.16, 0.22)
        c.setFont("HeiseiKakuGo-W5", 13)
        c.drawString(76, y, f.get("name", "(unnamed flow)"))
        y -= 16

        anchors = [f.get("start")] + list(f.get("stops") or []) + [f.get("end")]
        anchors = [a for a in anchors if a]
        c.setFont("HeiseiKakuGo-W5", 10)
        c.setFillColorRGB(0.4, 0.45, 0.5)
        for i, a in enumerate(anchors):
            label = "📍 start" if i == 0 else "🏁 end" if i == len(anchors) - 1 else f"⏵ stop {i}"
            page_name = page_lookup.get(a.get("page_id"), a.get("page_id"))
            c.drawString(94, y, f"{label}: {page_name} · {a.get('object_id')}")
            y -= 14
        y -= 8
        if y < 80:
            c.showPage()
            y = page_h - 54


def _export_architecture_pdf() -> bytes:
    """Build a multi-page PDF covering the whole architecture."""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.pdfgen import canvas as _canvas

    try:
        pdfmetrics.registerFont(UnicodeCIDFont("HeiseiKakuGo-W5"))
    except Exception:
        # Already registered or not available; fall back to default font silently.
        pass

    pages = _read_index().get("pages", [])
    flows = _list_flows()

    buf = io.BytesIO()
    page_w, page_h = landscape(A4)
    c = _canvas.Canvas(buf, pagesize=landscape(A4))

    _draw_pdf_cover(c, page_w, page_h, pages, flows)
    c.showPage()

    _draw_pdf_toc(c, page_w, page_h, pages)
    c.showPage()

    for i, p in enumerate(pages, 1):
        page_data = _read_page(p["id"])
        _draw_arch_page(c, page_w, page_h, page_data, i, len(pages))
        c.showPage()

    if flows:
        _draw_pdf_flows(c, page_w, page_h, flows, pages)
        c.showPage()

    c.save()
    return buf.getvalue()


def _render_import_export_panel() -> None:
    c1, c2 = st.columns(2)
    with c1:
        st.markdown("**Export current architecture**")
        st.caption(
            "Bundles every page, snapshot, attachment, and flow into a "
            "single .zip — share it, archive it, or re-import later to "
            "swap project datasets."
        )
        blob = _export_architecture_bytes()
        ts = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
        st.download_button(
            "⬇ Download architecture.zip",
            data=blob,
            file_name=f"architecture_{ts}.zip",
            mime="application/zip",
            key="arch_export_dl",
        )
        st.caption(f"Bundle size: {_human_size(len(blob))}")
        st.markdown("**📄 PDF report**")
        st.caption(
            "Printable / shareable summary: cover, contents, every layer "
            "page rendered, plus a data-flows index."
        )
        try:
            pdf_blob = _export_architecture_pdf()
            st.download_button(
                "⬇ Download architecture.pdf",
                data=pdf_blob,
                file_name=f"architecture_{ts}.pdf",
                mime="application/pdf",
                key="arch_export_pdf_dl",
            )
            st.caption(f"PDF size: {_human_size(len(pdf_blob))}")
        except Exception as e:  # noqa: BLE001 — surface any reportlab issue inline
            st.error(f"PDF generation failed: {e}")
    with c2:
        st.markdown("**Import architecture**")
        st.warning(
            "⚠️ Importing **replaces** the current architecture entirely "
            "(all pages, attachments, snapshots, flows)."
        )
        uploaded = st.file_uploader(
            "Choose a previously-exported .zip",
            type=["zip"],
            accept_multiple_files=False,
            key="arch_import_uploader",
        )
        if uploaded is not None:
            btn_key = f"arch_import_apply__{uploaded.name}__{uploaded.size}"
            if st.button(
                f"Replace current with “{uploaded.name}”",
                key=btn_key,
                type="primary",
            ):
                ok, msg = _import_architecture_bytes(uploaded.getvalue())
                if ok:
                    st.success(msg)
                    st.rerun()
                else:
                    st.error(msg)


def _is_fresh_install(pages: list[dict], current_page_id: str) -> bool:
    if len(pages) > 1:
        return False
    page_state = _read_page(current_page_id)
    if page_state.get("objects"):
        return False
    if _list_snapshots(current_page_id):
        return False
    return True


_SAMPLE_BUNDLE = _PROJECT_ROOT / "sample_data" / "architecture_sample.zip"


def _wipe_and_reinit_architecture() -> None:
    """Remove input/architecture/ entirely and recreate with a single empty
    Root page. Resets all transient session state so the next render lands
    on a clean slate."""
    if _ARCH_ROOT.exists():
        shutil.rmtree(_ARCH_ROOT)
    _ensure_layout()
    st.session_state[_SS_CURRENT_PAGE] = DEFAULT_PAGE_ID
    st.session_state[_SS_NAV_HISTORY] = []
    st.session_state[_SS_SELECTED_ID] = None
    st.session_state[_SS_DIFF_MODE] = None
    st.session_state[_SS_PROCESSED_EVENTS] = []


def _render_new_architecture_panel() -> None:
    pending_key = "arch_new_pending"
    pending = bool(st.session_state.get(pending_key, False))
    title = "🆕 Start a new architecture"
    if not pending:
        st.caption(
            "Wipe every page, attachment, snapshot, and flow and reset "
            "to a single empty Root page. You'll be prompted to back up "
            "the current state first."
        )
        if st.button("Start new architecture…", key="arch_new_start"):
            st.session_state[pending_key] = True
            st.rerun()
        return

    st.warning(
        "⚠️ This will permanently delete the current architecture — every "
        "page, snapshot, attached-file revision, and data flow."
    )

    st.markdown("**Step 1 — Back up the current architecture (recommended):**")
    blob = _export_architecture_bytes()
    ts = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    st.download_button(
        "⬇ Download backup.zip",
        data=blob,
        file_name=f"architecture_backup_{ts}.zip",
        mime="application/zip",
        key="arch_new_backup_dl",
        help="Save this so you can re-import via 📦 Import / Export later.",
    )
    st.caption(f"Backup size: {_human_size(len(blob))}")

    st.markdown("**Step 2 — Discard everything and start fresh:**")
    c1, c2 = st.columns(2)
    if c1.button(
        "🗑 Discard everything →",
        key="arch_new_confirm",
        type="primary",
    ):
        _wipe_and_reinit_architecture()
        st.session_state[pending_key] = False
        st.success("New architecture started — single empty Root page.")
        st.rerun()
    if c2.button("Cancel", key="arch_new_cancel"):
        st.session_state[pending_key] = False
        st.rerun()


def _install_sample_from_bundle() -> None:
    """Read sample_data/architecture_sample.zip and feed it through the
    standard import path."""
    try:
        blob = _SAMPLE_BUNDLE.read_bytes()
    except OSError as e:
        st.error(f"Couldn't read sample bundle: {e}")
        return
    ok, msg = _import_architecture_bytes(blob)
    if ok:
        st.success(msg)
        st.rerun()
    else:
        st.error(msg)


def _render_sample_panel(pages: list[dict], current_page_id: str) -> None:
    if not _SAMPLE_BUNDLE.exists():
        return  # no bundled sample shipped — hide the panel entirely

    fresh = _is_fresh_install(pages, current_page_id)
    if fresh:
        with st.container(border=True):
            st.markdown(
                "👋 **New here?** The bundled sample architecture installs 7 "
                "layer pages with cross-page links, FID-bound boxes, "
                "attachments with two revisions, a baseline snapshot, and "
                "three pre-defined data flows."
            )
            if st.button(
                "🎁 Install sample architecture",
                key="arch_sample_install_fresh",
            ):
                _install_sample_from_bundle()
    else:
        st.warning(
            "⚠️ Installing **replaces** the current architecture entirely "
            "(all pages, attachments, snapshots, flows)."
        )
        st.caption(
            f"Source: `sample_data/architecture_sample.zip` "
            f"({_human_size(_SAMPLE_BUNDLE.stat().st_size)})"
        )
        if st.button(
            "Install sample architecture (clears everything)",
            key="arch_sample_install_replace",
        ):
            _install_sample_from_bundle()


# ---------------------------------------------------------------------------
# Admin strip — five compact popovers right under the canvas, replacing what
# used to be five separate expanders.
# ---------------------------------------------------------------------------

def _render_admin_strip(pages: list[dict], current_page_id: str) -> None:
    tt = _arch_tooltips()

    snap_count = len(_list_snapshots(current_page_id))
    diff = _ss_get(_SS_DIFF_MODE, None)
    snap_label = f"🗂 Snapshots ({snap_count})"
    if diff:
        snap_label = f"🗂 Snapshots ({snap_count}) · diff on"

    hk_total = (
        len(_find_dangling_links())
        + len(_find_unreachable_pages())
        + len(_find_orphan_attachments())
    )
    hk_label = (
        f"🧹 Housekeeping ({hk_total})" if hk_total else "🧹 Housekeeping ✓"
    )

    show_sample = _SAMPLE_BUNDLE.exists()
    cols = st.columns([3, 3, 3, 2] + ([2] if show_sample else []) + [4])

    with cols[0]:
        with st.popover(snap_label, use_container_width=True, help=tt["popover_snapshots"]):
            _render_snapshots_panel(current_page_id)

    with cols[1]:
        with st.popover(hk_label, use_container_width=True, help=tt["popover_housekeeping"]):
            _render_housekeeping_panel()

    with cols[2]:
        with st.popover("📦 Import / Export", use_container_width=True, help=tt["popover_import_export"]):
            _render_import_export_panel()

    with cols[3]:
        with st.popover("🆕 New", use_container_width=True, help=tt["popover_new"]):
            _render_new_architecture_panel()

    if show_sample:
        with cols[4]:
            with st.popover("🎁 Sample", use_container_width=True, help=tt["popover_sample"]):
                _render_sample_panel(pages, current_page_id)


# ---------------------------------------------------------------------------
# Tab entry point
# ---------------------------------------------------------------------------

def render_architecture_tab() -> None:
    _ensure_layout()
    idx = _read_index()
    pages = idx.get("pages", [])
    if not pages:
        pages = [{"id": DEFAULT_PAGE_ID, "name": DEFAULT_PAGE_NAME, "locked": False}]

    current = _ss_get(_SS_CURRENT_PAGE, pages[0]["id"])
    if current not in {p["id"] for p in pages}:
        current = pages[0]["id"]
        st.session_state[_SS_CURRENT_PAGE] = current

    page_state = _read_page(current)
    stamps = _load_stamps()
    attach_summary = _attachments_summary_for_page(current)
    nav_history = _ss_get(_SS_NAV_HISTORY, [])
    fid_master = _get_fid_master_list()
    fid_metrics = _get_fid_metrics()

    # Resolve the active diff (if any). Self-heals when the referenced
    # snapshot was deleted underneath us.
    diff_state = None
    df = _ss_get(_SS_DIFF_MODE, None)
    if df:
        snap_a_full = _read_snapshot(current, df.get("snapshot_a", ""))
        if df.get("snapshot_b") == "current":
            page_b = page_state
            label_b = "current"
        else:
            snap_b_full = _read_snapshot(current, df.get("snapshot_b", ""))
            page_b = snap_b_full.get("page_state") if snap_b_full else None
            label_b = (snap_b_full.get("label") if snap_b_full else None) or df.get("snapshot_b")
        if snap_a_full and page_b is not None:
            diff_state = {
                "state_a": snap_a_full.get("page_state"),
                "state_b": page_b,
                "label_a": snap_a_full.get("label") or df.get("snapshot_a"),
                "label_b": label_b,
            }
        else:
            st.session_state[_SS_DIFF_MODE] = None

    search_index = _build_search_index()
    all_pages = _get_all_pages_data()
    flows = _list_flows()

    # Compact admin strip — five popovers above the iframe.
    _render_admin_strip(pages, current)

    # Stable key so iframe state (flow editor / pick mode / enabled flow
    # toggles) survives page navigation. The component re-syncs per-page
    # state internally via useEffect when current_page_id changes in args.
    component_key = "arch_canvas"
    value = _arch_component(
        page_state=page_state,
        stamps=stamps,
        pages=pages,
        current_page_id=current,
        nav_history_depth=len(nav_history),
        attachments_summary=attach_summary,
        fid_master=fid_master,
        fid_metrics=fid_metrics,
        diff_state=diff_state,
        search_index=search_index,
        all_pages=all_pages,
        flows=flows,
        tooltips=_arch_tooltips(),
        key=component_key,
        default=None,
    )
    saved_at, needs_rerun = _handle_component_value(value, current)

    # Footer: most recent save timestamp.
    if saved_at is None:
        try:
            mtime = _page_file(current).stat().st_mtime
            saved_at = _dt.datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")
        except OSError:
            saved_at = "—"
    st.caption(f"💾 最終保存 {saved_at}  ·  page: {current}")

    selected_id = _ss_get(_SS_SELECTED_ID, None)
    if selected_id and not diff_state:
        # Drilldown (FID-only, informational) → description (long-form memo)
        # → attachments (formal documents). All hidden in diff mode since
        # they refer to live state, not the snapshots being compared.
        selected_fid = _resolve_selected_fid(current, selected_id)
        if selected_fid:
            _render_drilldown_panel_if_fid(selected_fid)
        _render_description_panel(current, selected_id)
        _render_attachments_panel(current, selected_id)

    if needs_rerun:
        st.rerun()


__all__ = ["render_architecture_tab"]

