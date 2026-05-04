import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from "reactflow";
import { Streamlit, withStreamlitConnection } from "streamlit-component-lib";
import BoxNode from "./BoxNode.jsx";
import StampNode from "./StampNode.jsx";
import TextNode from "./TextNode.jsx";
import ArchEdge from "./ArchEdge.jsx";
import Toolbar from "./Toolbar.jsx";
import StampsPalette, { DRAG_MIME as STAMP_DRAG_MIME } from "./StampsPalette.jsx";
import FidsPalette, { FID_DRAG_MIME } from "./FidsPalette.jsx";
import Inspector from "./Inspector.jsx";
import Search from "./Search.jsx";
import MultiLayerView from "./MultiLayerView.jsx";
import LinkageView from "./LinkageView.jsx";
import FlowsPanel from "./FlowsPanel.jsx";
import FlowEditor from "./FlowEditor.jsx";
import FlowOverlay from "./FlowOverlay.jsx";
import {
  edgeStyle,
  newId,
  computeOverlayColor,
  formatMetricValue,
  METRIC_INFO,
} from "./colorTags.js";
import { computeDiff } from "./diff.js";
import { tidyLayout } from "./layout.js";

const AUTO_SAVE_DEBOUNCE_MS = 1000;
const FRAME_HEIGHT_PX = 720;

// ---------- shape conversion: disk JSON ⇄ React Flow ----------

function objToNode(obj) {
  return {
    id: obj.id,
    type: obj.type, // "box" | "stamp" | "text"
    position: { x: obj.x ?? 0, y: obj.y ?? 0 },
    // Lift text annotations above everything else so they can overlap boxes.
    zIndex: obj.type === "text" ? 100 : undefined,
    data: {
      label: obj.label || "",
      colorTag: obj.color_tag || null,
      fid: obj.fid || null,
      linkToPage: obj.link_to_page || null,
      linkToObject: obj.link_to_object || null,
      stampId: obj.stamp_id || null,
    },
  };
}

function objToEdge(obj) {
  return {
    id: obj.id,
    type: "arch",
    source: obj.from,
    target: obj.to,
    label: obj.label || "",
    data: {
      colorTag: obj.color_tag || null,
      fid: obj.fid || null,
      linkToPage: obj.link_to_page || null,
      linkToObject: obj.link_to_object || null,
    },
  };
}

function nodeToObj(n) {
  return {
    id: n.id,
    type: n.type,
    x: n.position.x,
    y: n.position.y,
    label: n.data?.label || "",
    color_tag: n.data?.colorTag || null,
    fid: n.data?.fid || null,
    link_to_page: n.data?.linkToPage || null,
    link_to_object: n.data?.linkToObject || null,
    stamp_id: n.type === "stamp" ? (n.data?.stampId || null) : null,
  };
}

function edgeToObj(e) {
  return {
    id: e.id,
    type: "edge",
    from: e.source,
    to: e.target,
    label: e.label || "",
    color_tag: e.data?.colorTag || null,
    fid: e.data?.fid || null,
    link_to_page: e.data?.linkToPage || null,
    link_to_object: e.data?.linkToObject || null,
  };
}

function deriveStateFromArgs(args) {
  const incoming = (args && args.page_state) || {};
  return {
    page_id: incoming.page_id || "p_root",
    name: incoming.name || "Root",
    schema_version: incoming.schema_version || 1,
    locked: !!incoming.locked,
    objects: Array.isArray(incoming.objects) ? incoming.objects : [],
    viewport: incoming.viewport || { x: 0, y: 0, zoom: 1 },
  };
}

// ---------- main canvas ----------

function ArchCanvas({ args }) {
  const initialState = useMemo(
    () => deriveStateFromArgs(args),
    [args?.page_state?.page_id]
  );
  const stamps = (args && args.stamps) || {};
  const pages = (args && args.pages) || [];
  const currentPageId = (args && args.current_page_id) || initialState.page_id;
  const navHistoryDepth = (args && args.nav_history_depth) || 0;
  const attachmentsSummary = (args && args.attachments_summary) || {};
  const fidMaster = (args && args.fid_master) || [];
  const fidMetrics = (args && args.fid_metrics) || {};
  const overlayAvailable = Object.keys(fidMetrics).length > 0;
  const diffState = (args && args.diff_state) || null;
  const diffActive = !!diffState;
  const searchIndex = (args && args.search_index) || [];
  const allPages = (args && args.all_pages) || [];
  const flows = (args && args.flows) || [];
  const tooltips = (args && args.tooltips) || {};

  const [pageId, setPageId] = useState(initialState.page_id);
  const [pageName, setPageName] = useState(initialState.name);
  const [locked, setLocked] = useState(initialState.locked);
  const [nodes, setNodes] = useState(() =>
    initialState.objects.filter((o) => o.type !== "edge").map(objToNode)
  );
  const [edges, setEdges] = useState(() =>
    initialState.objects.filter((o) => o.type === "edge").map(objToEdge)
  );
  const [viewport, setViewport] = useState(initialState.viewport);
  const [selectedId, setSelectedId] = useState(null);
  const [overlayOn, setOverlayOn] = useState(false);
  const [overlayMetrics, setOverlayMetrics] = useState(
    () => new Set(["actual_progress"])
  );

  const toggleOverlayMetric = useCallback((metricKey, checked) => {
    setOverlayMetrics((prev) => {
      const next = new Set(prev);
      if (checked) next.add(metricKey);
      else next.delete(metricKey);
      return next;
    });
  }, []);
  const [searchOpen, setSearchOpen] = useState(false);
  const [openView, setOpenView] = useState(null); // null | "multilayer" | "linkage"
  const [leftRailOpen, setLeftRailOpen] = useState(true);
  const [rightRailOpen, setRightRailOpen] = useState(true);
  const [enabledFlowIds, setEnabledFlowIds] = useState(new Set()); // session-only
  const [flowEditor, setFlowEditor] = useState(null); // { id, name, color, start, stops, end } | null
  const [pickMode, setPickMode] = useState(null); // null | "start" | "end" | "stop_<idx>" | "stop_new"
  const pickModeRef = useRef(null);
  useEffect(() => {
    pickModeRef.current = pickMode;
  }, [pickMode]);
  // capturePickedAnchor is defined later in this file; we route through a
  // ref so onSelectionChange (declared earlier) doesn't read it before the
  // const is initialised (TDZ).
  const capturePickedAnchorRef = useRef(() => {});

  const saveTimerRef = useRef(null);
  const rfApi = useReactFlow();

  // Per-page undo/redo stacks. Each entry is { nodes, edges }; viewport,
  // selection, and lock state are deliberately excluded so undo only
  // reverses architectural edits.
  const historyRef = useRef({}); // { [pageId]: { undo: [], redo: [] } }
  const lastPushAtRef = useRef(0);
  const HISTORY_DEBOUNCE_MS = 500;
  const HISTORY_LIMIT = 100;
  const [, setHistoryTick] = useState(0); // forces re-render to refresh button-disabled state

  // Refs for buildPersistedState so callbacks don't capture stale closures.
  const stateRef = useRef({ pageId, pageName, locked, nodes, edges, viewport });
  useEffect(() => {
    stateRef.current = { pageId, pageName, locked, nodes, edges, viewport };
  }, [pageId, pageName, locked, nodes, edges, viewport]);

  // Reset on incoming page change.
  useEffect(() => {
    if (initialState.page_id !== pageId) {
      setPageId(initialState.page_id);
      setPageName(initialState.name);
      setLocked(initialState.locked);
      setNodes(initialState.objects.filter((o) => o.type !== "edge").map(objToNode));
      setEdges(initialState.objects.filter((o) => o.type === "edge").map(objToEdge));
      setViewport(initialState.viewport);
      setSelectedId(null);
    }
  }, [initialState, pageId]);

  // Apply incoming viewport once on mount + tell Streamlit our height.
  useEffect(() => {
    rfApi.setViewport(initialState.viewport, { duration: 0 });
    Streamlit.setFrameHeight(FRAME_HEIGHT_PX);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- save helpers ----------

  const buildPersistedState = useCallback(() => {
    const s = stateRef.current;
    return {
      page_id: s.pageId,
      name: s.pageName,
      schema_version: 1,
      locked: s.locked,
      objects: [...s.nodes.map(nodeToObj), ...s.edges.map(edgeToObj)],
      viewport: s.viewport,
    };
  }, []);

  // Cancel any pending debounced save without firing it.
  const cancelPendingSave = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  };

  // Debounced save (no other events).
  const scheduleSave = useCallback(() => {
    cancelPendingSave();
    saveTimerRef.current = setTimeout(() => {
      Streamlit.setComponentValue({
        kind: "save",
        page_state: buildPersistedState(),
        selected_id: selectedIdRef.current,
        client_ts: new Date().toISOString(),
        event_id: newId("evt_"),
      });
    }, AUTO_SAVE_DEBOUNCE_MS);
  }, [buildPersistedState]);

  // selectedId in a ref so save events can include it without recreating.
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Post any non-save event. Bundles current page_state so any pending edits
  // are flushed atomically (debounced save is cancelled to avoid duplicates).
  const postEvent = useCallback(
    (kind, extras = {}) => {
      cancelPendingSave();
      Streamlit.setComponentValue({
        kind,
        page_state: buildPersistedState(),
        selected_id: selectedIdRef.current,
        client_ts: new Date().toISOString(),
        event_id: newId("evt_"),
        ...extras,
      });
    },
    [buildPersistedState]
  );

  // ---------- undo / redo ----------

  const _historyFor = useCallback((pid) => {
    if (!historyRef.current[pid]) {
      historyRef.current[pid] = { undo: [], redo: [] };
    }
    return historyRef.current[pid];
  }, []);

  const _entry = () => ({
    nodes: stateRef.current.nodes,
    edges: stateRef.current.edges,
  });

  const pushHistory = useCallback(
    (force = false) => {
      const now = Date.now();
      if (!force && now - lastPushAtRef.current < HISTORY_DEBOUNCE_MS) return;
      lastPushAtRef.current = now;
      const pid = stateRef.current.pageId;
      const h = _historyFor(pid);
      h.undo.push(_entry());
      if (h.undo.length > HISTORY_LIMIT) h.undo.shift();
      h.redo = [];
      setHistoryTick((t) => t + 1);
    },
    [_historyFor]
  );

  const undo = useCallback(() => {
    if (stateRef.current.locked) return;
    const pid = stateRef.current.pageId;
    const h = _historyFor(pid);
    if (h.undo.length === 0) return;
    const prev = h.undo.pop();
    h.redo.push(_entry());
    setNodes(prev.nodes);
    setEdges(prev.edges);
    lastPushAtRef.current = 0;
    setHistoryTick((t) => t + 1);
    scheduleSave();
  }, [_historyFor, scheduleSave]);

  const redo = useCallback(() => {
    if (stateRef.current.locked) return;
    const pid = stateRef.current.pageId;
    const h = _historyFor(pid);
    if (h.redo.length === 0) return;
    const next = h.redo.pop();
    h.undo.push(_entry());
    setNodes(next.nodes);
    setEdges(next.edges);
    lastPushAtRef.current = 0;
    setHistoryTick((t) => t + 1);
    scheduleSave();
  }, [_historyFor, scheduleSave]);

  // ---------- React Flow handlers ----------

  const onNodesChange = useCallback(
    (changes) => {
      // Push a history step for explicit removals (keyboard Delete) so
      // undo can restore them. Position drags are captured separately via
      // onNodeDragStart.
      if (changes.some((c) => c.type === "remove")) pushHistory(true);
      setNodes((curr) => applyNodeChanges(changes, curr));
      scheduleSave();
    },
    [pushHistory, scheduleSave]
  );

  const onEdgesChange = useCallback(
    (changes) => {
      if (changes.some((c) => c.type === "remove")) pushHistory(true);
      setEdges((curr) => applyEdgeChanges(changes, curr));
      scheduleSave();
    },
    [pushHistory, scheduleSave]
  );

  const onNodeDragStart = useCallback(() => {
    pushHistory(true);
  }, [pushHistory]);

  const onConnect = useCallback(
    (params) => {
      if (stateRef.current.locked) return;
      pushHistory(true);
      const id = newId("e_");
      setEdges((curr) =>
        addEdge({ ...params, id, label: "", data: {} }, curr)
      );
      scheduleSave();
    },
    [pushHistory, scheduleSave]
  );

  const onMoveEnd = useCallback(
    (_evt, vp) => {
      setViewport(vp);
      scheduleSave();
    },
    [scheduleSave]
  );

  // Continuous viewport tracking so FlowOverlay's transform stays in sync
  // during pan/zoom (onMoveEnd alone only fires after the gesture ends).
  const onMove = useCallback((_evt, vp) => {
    setViewport(vp);
  }, []);

  const onSelectionChange = useCallback(
    ({ nodes: ns, edges: es }) => {
      // If we're picking a flow anchor, the next single click captures the
      // object id and exits pick mode — don't fire normal selection events.
      if (pickModeRef.current) {
        let picked = null;
        if (ns.length === 1 && es.length === 0) picked = ns[0].id;
        else if (es.length === 1 && ns.length === 0) picked = es[0].id;
        if (picked) {
          capturePickedAnchorRef.current(picked);
        }
        return;
      }
      let next = null;
      if (ns.length === 1 && es.length === 0) next = ns[0].id;
      else if (es.length === 1 && ns.length === 0) next = es[0].id;
      setSelectedId(next);
      // Tell Python so the attachments panel below the iframe updates.
      // No save here — selection is metadata-only.
      Streamlit.setComponentValue({
        kind: "selection",
        selected_id: next,
        client_ts: new Date().toISOString(),
        event_id: newId("evt_"),
      });
    },
    []
  );

  // ---------- drag-and-drop from stamps palette ----------

  const onDragOver = useCallback((evt) => {
    evt.preventDefault();
    evt.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (evt) => {
      evt.preventDefault();
      if (stateRef.current.locked) return;
      const pos = rfApi.screenToFlowPosition({
        x: evt.clientX,
        y: evt.clientY,
      });

      // Stamp drop → new stamp pre-set to that icon.
      const stampId = evt.dataTransfer.getData(STAMP_DRAG_MIME);
      if (stampId) {
        let label = stampId;
        for (const items of Object.values(stamps || {})) {
          const found = items.find((s) => s.id === stampId);
          if (found) {
            label = found.label;
            break;
          }
        }
        const id = newId("o_");
        pushHistory(true);
        setNodes((curr) => [
          ...curr,
          objToNode({
            id,
            type: "stamp",
            x: pos.x - 32,
            y: pos.y - 32,
            label,
            stamp_id: stampId,
          }),
        ]);
        setSelectedId(id);
        scheduleSave();
        return;
      }

      // FID drop → new box pre-bound to the FID, label = master 機能名.
      const fidJson = evt.dataTransfer.getData(FID_DRAG_MIME);
      if (fidJson) {
        try {
          const fid = JSON.parse(fidJson);
          if (!fid || !fid.id) return;
          const id = newId("o_");
          pushHistory(true);
          setNodes((curr) => [
            ...curr,
            objToNode({
              id,
              type: "box",
              x: pos.x - 80,
              y: pos.y - 28,
              label: fid.name || fid.id,
              fid: fid.id,
            }),
          ]);
          setSelectedId(id);
          scheduleSave();
        } catch {
          /* ignore malformed payload */
        }
      }
    },
    [stamps, rfApi, pushHistory, scheduleSave]
  );

  // ---------- toolbar actions ----------

  const addBox = useCallback(() => {
    if (stateRef.current.locked) return;
    pushHistory(true);
    const center = rfApi.screenToFlowPosition({ x: 480, y: 280 });
    const id = newId("o_");
    const newNode = objToNode({
      id,
      type: "box",
      x: center.x - 80,
      y: center.y - 28,
      label: "New Box",
    });
    setNodes((curr) => [...curr, newNode]);
    setSelectedId(id);
    scheduleSave();
  }, [rfApi, pushHistory, scheduleSave]);

  const addText = useCallback(() => {
    if (stateRef.current.locked) return;
    pushHistory(true);
    const center = rfApi.screenToFlowPosition({ x: 480, y: 280 });
    const id = newId("o_");
    const newNode = objToNode({
      id,
      type: "text",
      x: center.x - 40,
      y: center.y - 8,
      label: "Text",
    });
    setNodes((curr) => [...curr, newNode]);
    setSelectedId(id);
    scheduleSave();
  }, [rfApi, pushHistory, scheduleSave]);

  const toggleLock = useCallback(() => {
    setLocked((curr) => !curr);
    scheduleSave();
  }, [scheduleSave]);

  // ---------- inspector updates ----------

  const updateSelected = useCallback(
    (patch) => {
      if (stateRef.current.locked || !selectedId) return;
      pushHistory();
      let touchedNode = false;
      setNodes((curr) => {
        const idx = curr.findIndex((n) => n.id === selectedId);
        if (idx === -1) return curr;
        touchedNode = true;
        const next = [...curr];
        next[idx] = { ...curr[idx], data: { ...curr[idx].data, ...patch } };
        return next;
      });
      if (!touchedNode) {
        setEdges((curr) => {
          const idx = curr.findIndex((e) => e.id === selectedId);
          if (idx === -1) return curr;
          const cur = curr[idx];
          const updated = { ...cur };
          if ("label" in patch) updated.label = patch.label;
          updated.data = { ...cur.data };
          if ("colorTag" in patch) updated.data.colorTag = patch.colorTag;
          if ("fid" in patch) updated.data.fid = patch.fid;
          if ("linkToPage" in patch) updated.data.linkToPage = patch.linkToPage;
          if ("linkToObject" in patch) updated.data.linkToObject = patch.linkToObject;
          const next = [...curr];
          next[idx] = updated;
          return next;
        });
      }
      scheduleSave();
    },
    [selectedId, pushHistory, scheduleSave]
  );

  const deleteSelected = useCallback(() => {
    if (stateRef.current.locked || !selectedId) return;
    pushHistory(true);
    const id = selectedId;
    setNodes((curr) => {
      const filtered = curr.filter((n) => n.id !== id);
      if (filtered.length !== curr.length) {
        setEdges((eCurr) =>
          eCurr.filter((e) => e.source !== id && e.target !== id)
        );
      }
      return filtered;
    });
    setEdges((curr) => curr.filter((e) => e.id !== id));
    setSelectedId(null);
    scheduleSave();
  }, [selectedId, pushHistory, scheduleSave]);

  // ---------- page-level actions (post events to Python) ----------

  const onSwitchPage = useCallback(
    (toPageId) => {
      if (toPageId === currentPageId) return;
      postEvent("navigate", { to_page_id: toPageId });
    },
    [currentPageId, postEvent]
  );

  const onNavigateBack = useCallback(() => {
    postEvent("navigate_back");
  }, [postEvent]);

  const onCreatePage = useCallback(
    (name) => {
      postEvent("create_page", { name });
    },
    [postEvent]
  );

  const onRenamePage = useCallback(
    (pid, name) => {
      postEvent("rename_page", { page_id: pid, name });
    },
    [postEvent]
  );

  const onDeletePage = useCallback(
    (pid) => {
      postEvent("delete_page", { page_id: pid });
    },
    [postEvent]
  );

  const onOpenLinkedPage = useCallback(
    (toPageId) => {
      postEvent("navigate", { to_page_id: toPageId });
    },
    [postEvent]
  );

  const onOpenLinkedObject = useCallback(
    (link) => {
      if (!link || !link.page_id || !link.object_id) return;
      postEvent("navigate_and_select", {
        to_page_id: link.page_id,
        selected_id: link.object_id,
      });
    },
    [postEvent]
  );

  const onTidy = useCallback(() => {
    if (stateRef.current.locked) return;
    pushHistory(true);
    setNodes((curr) => tidyLayout(curr, stateRef.current.edges, "LR"));
    scheduleSave();
  }, [pushHistory, scheduleSave]);

  // Inline label editing — invoked from BoxNode / StampNode / TextNode when
  // the user double-clicks the label and commits a new value.
  const onUpdateLabel = useCallback(
    (nodeId, newLabel) => {
      if (stateRef.current.locked) return;
      let didChange = false;
      setNodes((curr) => {
        const idx = curr.findIndex((n) => n.id === nodeId);
        if (idx === -1) return curr;
        if ((curr[idx].data?.label || "") === newLabel) return curr;
        didChange = true;
        const next = [...curr];
        next[idx] = {
          ...curr[idx],
          data: { ...curr[idx].data, label: newLabel },
        };
        return next;
      });
      if (didChange) {
        pushHistory(true);
        scheduleSave();
      }
    },
    [pushHistory, scheduleSave]
  );

  const onTakeSnapshot = useCallback(
    (label) => {
      postEvent("create_snapshot", { label });
    },
    [postEvent]
  );

  const onSearchJump = useCallback(
    (toPageId, objectId) => {
      setSearchOpen(false);
      postEvent("navigate_and_select", {
        to_page_id: toPageId,
        selected_id: objectId,
      });
    },
    [postEvent]
  );

  // ---------- flows ----------

  const toggleFlow = useCallback((flowId) => {
    setEnabledFlowIds((prev) => {
      const next = new Set(prev);
      if (next.has(flowId)) next.delete(flowId);
      else next.add(flowId);
      return next;
    });
  }, []);

  const PALETTE = ["#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#0ea5e9", "#84cc16"];

  const onCreateFlow = useCallback(() => {
    const name = window.prompt("Name for the new flow?", "New flow");
    if (name === null) return;
    const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    postEvent("create_flow", { name: name.trim() || "New flow", color });
  }, [postEvent]);

  const onEditFlow = useCallback(
    (flowId) => {
      const f = (flows || []).find((x) => x.id === flowId);
      if (!f) return;
      setFlowEditor({
        id: f.id,
        name: f.name,
        color: f.color,
        start: f.start || null,
        stops: f.stops ? [...f.stops] : [],
        end: f.end || null,
      });
      setPickMode(null);
    },
    [flows]
  );

  const onDeleteFlow = useCallback(
    (flowId) => {
      if (!window.confirm("Delete this flow?")) return;
      setEnabledFlowIds((prev) => {
        const n = new Set(prev);
        n.delete(flowId);
        return n;
      });
      if (flowEditor && flowEditor.id === flowId) {
        setFlowEditor(null);
        setPickMode(null);
      }
      postEvent("delete_flow", { flow_id: flowId });
    },
    [flowEditor, postEvent]
  );

  const onSaveFlow = useCallback(() => {
    if (!flowEditor) return;
    postEvent("update_flow", {
      flow_id: flowEditor.id,
      name: flowEditor.name,
      color: flowEditor.color,
      start: flowEditor.start,
      stops: flowEditor.stops,
      end: flowEditor.end,
    });
    setFlowEditor(null);
    setPickMode(null);
  }, [flowEditor, postEvent]);

  const onCancelFlowEdit = useCallback(() => {
    setFlowEditor(null);
    setPickMode(null);
  }, []);

  const capturePickedAnchor = useCallback(
    (objectId) => {
      const role = pickModeRef.current;
      if (!role || !flowEditor) return;
      const anchor = { page_id: currentPageId, object_id: objectId };
      setFlowEditor((prev) => {
        if (!prev) return prev;
        if (role === "start") return { ...prev, start: anchor };
        if (role === "end") return { ...prev, end: anchor };
        if (role === "stop_new") {
          return { ...prev, stops: [...(prev.stops || []), anchor] };
        }
        if (role.startsWith("stop_")) {
          const idx = parseInt(role.split("_")[1], 10);
          const next = [...(prev.stops || [])];
          next[idx] = anchor;
          return { ...prev, stops: next };
        }
        return prev;
      });
      setPickMode(null);
    },
    [flowEditor, currentPageId]
  );
  // Keep the ref pointing at the latest closure so onSelectionChange (declared
  // earlier with empty deps) always invokes the up-to-date function.
  useEffect(() => {
    capturePickedAnchorRef.current = capturePickedAnchor;
  }, [capturePickedAnchor]);

  // Cmd/Ctrl+F → open search.
  // Cmd/Ctrl+Z → undo · Cmd/Ctrl+Shift+Z → redo
  useEffect(() => {
    const onKey = (e) => {
      const isMod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      // Skip undo/redo when typing in an input/textarea/contenteditable.
      const tag = (e.target && e.target.tagName) || "";
      const inField =
        tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable);
      if (isMod && k === "f") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (isMod && k === "z" && !e.shiftKey && !inField) {
        e.preventDefault();
        undo();
      } else if (isMod && k === "z" && e.shiftKey && !inField) {
        e.preventDefault();
        redo();
      } else if (isMod && k === "y" && !inField) {
        // common Windows redo binding
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ---------- decorate nodes/edges with derived attach-state for visuals ----------

  const nodeTypes = useMemo(
    () => ({ box: BoxNode, stamp: StampNode, text: TextNode }),
    []
  );
  const edgeTypes = useMemo(() => ({ arch: ArchEdge }), []);

  // When diff mode is active, replace the live nodes/edges with the diff
  // result (computed from the two page-state snapshots Python sent us).
  const diffComputed = useMemo(() => {
    if (!diffActive) return null;
    return computeDiff(diffState.state_a, diffState.state_b);
  }, [diffActive, diffState]);

  const baseNodes = diffActive ? diffComputed.nodes : nodes;
  const baseEdges = diffActive ? diffComputed.edges : edges;

  const decoratedNodes = useMemo(
    () =>
      baseNodes.map((n) => {
        let overlayColor = null;
        let overlayMetricList = null;
        if (!diffActive && overlayOn && n.data?.fid && fidMetrics[n.data.fid]) {
          const m = fidMetrics[n.data.fid];
          const list = [];
          overlayMetrics.forEach((k) => {
            const v = m[k];
            if (v == null || Number.isNaN(v)) return;
            const c = computeOverlayColor(v, k);
            if (!c) return;
            list.push({
              key: k,
              label: METRIC_INFO[k].label,
              value: formatMetricValue(v, k),
              bg: c.bg,
              border: c.border,
            });
          });
          if (list.length > 0) {
            overlayMetricList = list;
            // Single metric → also tint the node's background/border (the
            // original single-overlay look). Multiple metrics → leave the
            // node colour neutral and let the chips speak.
            if (list.length === 1) {
              overlayColor = { bg: list[0].bg, border: list[0].border };
            }
          }
        }
        return {
          ...n,
          data: {
            ...n.data,
            _stamps: stamps,
            _hasAttach: !diffActive && !!attachmentsSummary[n.id],
            _overlayColor: overlayColor,
            _overlayMetrics: overlayMetricList,
            _onOpenLinkedPage: onOpenLinkedPage,
            _onOpenLinkedObject: onOpenLinkedObject,
            _linkBadgeTitle: tooltips.node_link_jump || "Jump to linked page",
            _objLinkBadgeTitle: tooltips.node_obj_link_jump || "Jump to linked object",
            _onUpdateLabel: onUpdateLabel,
            _editingDisabled: diffActive,
            _allPages: allPages,
          },
        };
      }),
    [baseNodes, stamps, attachmentsSummary, overlayOn, overlayMetrics, fidMetrics, diffActive, onOpenLinkedPage, onOpenLinkedObject, onUpdateLabel, tooltips, allPages]
  );

  const decoratedEdges = useMemo(
    () =>
      baseEdges.map((e) => ({
        ...e,
        type: "arch",
        style: edgeStyle({
          colorTag: e.data?.colorTag,
          hasLink: !!e.data?.linkToPage,
          hasAttach: !diffActive && !!attachmentsSummary[e.id],
        }),
      })),
    [baseEdges, attachmentsSummary, diffActive]
  );

  const effectiveLocked = locked || diffActive;

  const selectedObj = useMemo(() => {
    if (!selectedId) return null;
    const sourceNodes = diffActive ? diffComputed.nodes : nodes;
    const sourceEdges = diffActive ? diffComputed.edges : edges;
    const n = sourceNodes.find((x) => x.id === selectedId);
    if (n) {
      return {
        kind: n.type,
        id: n.id,
        data: n.data,
        diffEntry: diffActive ? diffComputed.details[n.id] : null,
      };
    }
    const e = sourceEdges.find((x) => x.id === selectedId);
    if (e) {
      return {
        kind: "edge",
        id: e.id,
        data: { ...e.data, label: e.label },
        diffEntry: diffActive ? diffComputed.details[e.id] : null,
      };
    }
    return null;
  }, [selectedId, nodes, edges, diffActive, diffComputed]);

  return (
    <div className="arch-root">
      <Toolbar
        pages={pages}
        currentPageId={currentPageId}
        pageName={pageName}
        navDepth={navHistoryDepth}
        locked={locked}
        tooltips={tooltips}
        overlayOn={overlayOn}
        overlayMetrics={overlayMetrics}
        overlayAvailable={overlayAvailable}
        diffActive={diffActive}
        diffLabelA={diffState?.label_a}
        diffLabelB={diffState?.label_b}
        onSwitchPage={onSwitchPage}
        onNavigateBack={onNavigateBack}
        onCreatePage={onCreatePage}
        onRenamePage={onRenamePage}
        onDeletePage={onDeletePage}
        onAddBox={addBox}
        onAddText={addText}
        onTidy={onTidy}
        onUndo={undo}
        onRedo={redo}
        canUndo={!!historyRef.current[pageId]?.undo?.length}
        canRedo={!!historyRef.current[pageId]?.redo?.length}
        onToggleLock={toggleLock}
        onToggleOverlay={setOverlayOn}
        onToggleOverlayMetric={toggleOverlayMetric}
        onTakeSnapshot={onTakeSnapshot}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenMultiLayer={() => setOpenView("multilayer")}
        onOpenLinkage={() => setOpenView("linkage")}
        leftRailOpen={leftRailOpen}
        rightRailOpen={rightRailOpen}
        onToggleLeftRail={() => setLeftRailOpen((o) => !o)}
        onToggleRightRail={() => setRightRailOpen((o) => !o)}
      />
      <Search
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        index={searchIndex}
        onJump={onSearchJump}
      />
      {openView === "multilayer" && (
        <MultiLayerView
          pages={allPages}
          flows={flows}
          enabledIds={enabledFlowIds}
          onClose={() => setOpenView(null)}
        />
      )}
      {openView === "linkage" && (
        <LinkageView
          pages={allPages}
          flows={flows}
          enabledIds={enabledFlowIds}
          onClose={() => setOpenView(null)}
        />
      )}
      <div className="arch-body">
        {leftRailOpen && (
          <div className="arch-rail arch-rail-left">
            <FidsPalette fids={fidMaster} locked={effectiveLocked || !!pickMode} />
            <FlowsPanel
              flows={flows}
              enabledIds={enabledFlowIds}
              editingId={flowEditor ? flowEditor.id : null}
              onToggle={toggleFlow}
              onCreate={onCreateFlow}
              onEdit={onEditFlow}
              onDelete={onDeleteFlow}
            />
            <StampsPalette stamps={stamps} locked={effectiveLocked || !!pickMode} />
          </div>
        )}
        <div className="arch-canvas" onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={decoratedNodes}
            edges={decoratedEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={diffActive ? undefined : onNodesChange}
            onEdgesChange={diffActive ? undefined : onEdgesChange}
            onConnect={diffActive ? undefined : onConnect}
            onNodeDragStart={diffActive ? undefined : onNodeDragStart}
            onMove={onMove}
            onMoveEnd={diffActive ? undefined : onMoveEnd}
            onSelectionChange={onSelectionChange}
            nodesDraggable={!effectiveLocked}
            nodesConnectable={!effectiveLocked}
            edgesUpdatable={!effectiveLocked}
            elementsSelectable={true}
            fitView={false}
            minZoom={0.2}
            maxZoom={3}
            deleteKeyCode={effectiveLocked ? null : ["Backspace", "Delete"]}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} color="#e2e2e7" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => {
                const tag = n.data?.colorTag;
                const palette = {
                  frontend: "#3b82f6",
                  backend: "#10b981",
                  data: "#8b5cf6",
                  external: "#f97316",
                  infra: "#64748b",
                  deprecated: "#ef4444",
                  accent: "#ec4899",
                  neutral: "#cbd5e1",
                };
                if (tag && palette[tag]) return palette[tag];
                if (n.type === "stamp") return "#94a3b8";
                if (n.type === "text") return "#fde68a";
                return "#cbd5e1";
              }}
              nodeStrokeColor={(n) =>
                n.data?.linkToPage ? "#1e40af" : "#475569"
              }
              nodeStrokeWidth={1.5}
              nodeBorderRadius={3}
              maskColor="rgba(15, 23, 42, 0.06)"
            />
          </ReactFlow>
          <FlowOverlay
            flows={flows}
            enabledIds={enabledFlowIds}
            currentPageId={currentPageId}
            nodes={decoratedNodes}
            edges={decoratedEdges}
            viewport={viewport}
          />
          {nodes.length === 0 && edges.length === 0 && (
            <div className="arch-empty-hint">
              <div><b>{pageName}</b></div>
              <div>
                Click <b>➕ Box</b> in the toolbar or drag a stamp from the
                left rail to begin.
              </div>
            </div>
          )}
        </div>
        {rightRailOpen && (flowEditor ? (
          <FlowEditor
            flow={flowEditor}
            pages={pages}
            pickMode={pickMode}
            onChange={setFlowEditor}
            onPick={(role) => setPickMode(role)}
            onCancelPick={() => setPickMode(null)}
            onSave={onSaveFlow}
            onCancel={onCancelFlowEdit}
          />
        ) : (
          <Inspector
            selected={selectedObj}
            locked={effectiveLocked}
            stamps={stamps}
            pages={pages}
            allPages={allPages}
            currentPageId={currentPageId}
            attachmentsSummary={attachmentsSummary}
            fids={fidMaster}
            diffActive={diffActive}
            diffSummary={diffActive ? diffComputed.summary : null}
            onChange={updateSelected}
            onDelete={deleteSelected}
            onOpenLinkedPage={onOpenLinkedPage}
            onOpenLinkedObject={onOpenLinkedObject}
          />
        ))}
      </div>
    </div>
  );
}

class ArchErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
    // eslint-disable-next-line no-console
    console.error("Architecture component caught error:", error, info);
  }
  render() {
    if (this.state.error) {
      const stack =
        (this.state.info && this.state.info.componentStack) ||
        (this.state.error && this.state.error.stack) ||
        "";
      return (
        <div className="arch-error-boundary">
          <div className="arch-error-title">Architecture component error</div>
          <div className="arch-error-msg">
            {String(this.state.error && this.state.error.message ? this.state.error.message : this.state.error)}
          </div>
          {stack && (
            <details>
              <summary>Stack trace</summary>
              <pre>{stack}</pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

function ArchCanvasWrapper(props) {
  // Belt-and-braces frame height: ArchCanvas sets it too, but if the inner
  // tree fails before its useEffect fires, the wrapper still gives the
  // iframe a non-zero height so the error boundary's fallback is visible.
  useEffect(() => {
    Streamlit.setFrameHeight(720);
  }, []);
  return (
    <ArchErrorBoundary>
      <ReactFlowProvider>
        <ArchCanvas {...props} />
      </ReactFlowProvider>
    </ArchErrorBoundary>
  );
}

export default withStreamlitConnection(ArchCanvasWrapper);
