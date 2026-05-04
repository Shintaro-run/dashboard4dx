import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from "d3-force";

const TAG_COLOR = {
  frontend: "#3b82f6",
  backend: "#10b981",
  data: "#8b5cf6",
  external: "#f97316",
  infra: "#64748b",
  deprecated: "#ef4444",
  accent: "#ec4899",
  neutral: "#cbd5e1",
};
const NODE_R_PAGE = 13;
const NODE_R_OBJ = 6;

function buildGraph(pages, filter) {
  const nodes = [];
  const edges = [];
  const objIds = new Set();
  const pageIds = new Set();

  // Object nodes (filtered). Text annotations are decorative — skip.
  pages.forEach((page) => {
    (page.objects || []).forEach((obj) => {
      if (obj.type === "edge") return;
      if (obj.type === "text") return;
      if (filter.tag && obj.color_tag !== filter.tag) return;
      if (filter.fid && obj.fid !== filter.fid) return;
      if (filter.hasAttach && !(page.attach_counts || {})[obj.id]) return;
      const id = `obj_${page.page_id}_${obj.id}`;
      nodes.push({
        id,
        kind: "object",
        page_id: page.page_id,
        page_name: page.name,
        object_id: obj.id,
        type: obj.type,
        label: obj.label || obj.id,
        fid: obj.fid,
        colorTag: obj.color_tag,
        linkToPage: obj.link_to_page,
        hasAttach: !!(page.attach_counts || {})[obj.id],
      });
      objIds.add(id);
    });
  });

  // Page nodes (always included so cross-page link arrows have a target).
  pages.forEach((page) => {
    nodes.push({
      id: `page_${page.page_id}`,
      kind: "page",
      page_id: page.page_id,
      label: page.name,
    });
    pageIds.add(`page_${page.page_id}`);
  });

  // Edges. Skip any edge whose target node doesn't exist (dangling links to
  // deleted pages would otherwise blow up d3-force).
  pages.forEach((page) => {
    (page.objects || []).forEach((obj) => {
      if (obj.type === "edge") {
        const s = `obj_${page.page_id}_${obj.from}`;
        const t = `obj_${page.page_id}_${obj.to}`;
        if (objIds.has(s) && objIds.has(t)) {
          edges.push({ source: s, target: t, kind: "internal" });
        }
      } else if (obj.link_to_page) {
        const s = `obj_${page.page_id}_${obj.id}`;
        const t = `page_${obj.link_to_page}`;
        if (objIds.has(s) && pageIds.has(t)) {
          edges.push({ source: s, target: t, kind: "page_link" });
        }
      }
    });
  });

  return { nodes, edges };
}

function bfsPath(nodes, edges, startId, endId) {
  const adj = new Map(nodes.map((n) => [n.id, []]));
  edges.forEach((e) => {
    const s = typeof e.source === "string" ? e.source : e.source.id;
    const t = typeof e.target === "string" ? e.target : e.target.id;
    adj.get(s)?.push(t);
    adj.get(t)?.push(s);
  });
  const queue = [[startId]];
  const visited = new Set([startId]);
  while (queue.length) {
    const p = queue.shift();
    const last = p[p.length - 1];
    if (last === endId) return p;
    for (const n of adj.get(last) || []) {
      if (!visited.has(n)) {
        visited.add(n);
        queue.push([...p, n]);
      }
    }
  }
  return null;
}

export default function LinkageView({ pages, flows, enabledIds, onClose }) {
  const svgRef = useRef(null);
  const simRef = useRef(null);
  const linkElsRef = useRef([]);
  const nodeElsRef = useRef([]);
  const d3edgesRef = useRef([]);
  const d3nodesRef = useRef([]);

  const [filter, setFilter] = useState({ tag: "", fid: "", hasAttach: false });
  const [selected, setSelected] = useState([]);

  const { nodes, edges } = useMemo(
    () => buildGraph(pages, filter),
    [pages, filter]
  );

  const fids = useMemo(() => {
    const s = new Set();
    pages.forEach((p) =>
      (p.objects || []).forEach((o) => o.fid && s.add(o.fid))
    );
    return Array.from(s).sort();
  }, [pages]);

  // Build / rebuild the simulation when nodes/edges change.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const width = svg.clientWidth || 900;
    const height = svg.clientHeight || 540;

    const d3nodes = nodes.map((n) => ({ ...n }));
    const d3edges = edges.map((e) => ({ ...e }));
    d3edgesRef.current = d3edges;
    d3nodesRef.current = d3nodes;

    const simulation = forceSimulation(d3nodes)
      .force(
        "link",
        forceLink(d3edges)
          .id((d) => d.id)
          .distance((d) => (d.kind === "page_link" ? 95 : 55))
          .strength(0.6)
      )
      .force("charge", forceManyBody().strength(-180))
      .force("center", forceCenter(width / 2, height / 2))
      .force("x", forceX(width / 2).strength(0.04))
      .force("y", forceY(height / 2).strength(0.04))
      .force(
        "collide",
        forceCollide((d) => (d.kind === "page" ? NODE_R_PAGE + 6 : NODE_R_OBJ + 4))
      )
      .alphaDecay(0.04);
    simRef.current = simulation;

    const svgNS = "http://www.w3.org/2000/svg";
    const linkGroup = document.createElementNS(svgNS, "g");
    const flowGroup = document.createElementNS(svgNS, "g");
    const nodeGroup = document.createElementNS(svgNS, "g");
    svg.appendChild(linkGroup);
    svg.appendChild(flowGroup);
    svg.appendChild(nodeGroup);

    // Phase 8: build flow segments (object_id pair per consecutive anchor)
    // and let the simulation tick re-position them in lock-step with nodes.
    const enabledFlows = (flows || []).filter((f) => (enabledIds || new Set()).has(f.id));
    const flowSegments = [];
    enabledFlows.forEach((flow) => {
      const anchors = [flow.start, ...(flow.stops || []), flow.end].filter(Boolean);
      for (let i = 0; i < anchors.length - 1; i++) {
        const a = anchors[i];
        const b = anchors[i + 1];
        if (!a || !b) continue;
        flowSegments.push({
          name: flow.name,
          color: flow.color || "#3b82f6",
          fromId: `obj_${a.page_id}_${a.object_id}`,
          toId: `obj_${b.page_id}_${b.object_id}`,
        });
      }
    });
    const flowEls = flowSegments.map((seg) => {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("stroke", seg.color);
      path.setAttribute("stroke-width", "3");
      path.setAttribute("fill", "none");
      path.setAttribute("opacity", "0.85");
      path.classList.add("arch-flow-marching");
      const title = document.createElementNS(svgNS, "title");
      title.textContent = seg.name;
      path.appendChild(title);
      flowGroup.appendChild(path);
      return path;
    });
    const nodeById = new Map(d3nodes.map((n) => [n.id, n]));

    const linkEls = d3edges.map((e) => {
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute(
        "stroke",
        e.kind === "page_link" ? "#3b82f6" : "#94a3b8"
      );
      line.setAttribute("stroke-width", e.kind === "page_link" ? 1.5 : 1);
      if (e.kind === "page_link") line.setAttribute("stroke-dasharray", "4 3");
      line.setAttribute("opacity", "0.55");
      linkGroup.appendChild(line);
      return line;
    });
    linkElsRef.current = linkEls;

    const nodeEls = d3nodes.map((n) => {
      const g = document.createElementNS(svgNS, "g");
      g.style.cursor = "pointer";
      const isPage = n.kind === "page";
      const r = isPage ? NODE_R_PAGE : NODE_R_OBJ;

      const c = document.createElementNS(svgNS, "circle");
      c.setAttribute("r", r);
      c.setAttribute(
        "fill",
        isPage ? "#1e40af" : TAG_COLOR[n.colorTag] || "#cbd5e1"
      );
      c.setAttribute("stroke", "#ffffff");
      c.setAttribute("stroke-width", "1.5");
      g.appendChild(c);

      const t = document.createElementNS(svgNS, "text");
      t.textContent = isPage ? `📄 ${n.label}` : n.label;
      t.setAttribute("font-size", isPage ? "11" : "10");
      t.setAttribute("fill", "#1f2937");
      t.setAttribute("dx", r + 4);
      t.setAttribute("dy", 4);
      t.setAttribute("pointer-events", "none");
      g.appendChild(t);

      g.addEventListener("click", () => {
        setSelected((prev) => {
          if (prev.includes(n.id)) return prev.filter((id) => id !== n.id);
          if (prev.length >= 2) return [n.id];
          return [...prev, n.id];
        });
      });

      nodeGroup.appendChild(g);
      return g;
    });
    nodeElsRef.current = nodeEls;

    simulation.on("tick", () => {
      linkEls.forEach((line, i) => {
        const e = d3edges[i];
        line.setAttribute("x1", e.source.x);
        line.setAttribute("y1", e.source.y);
        line.setAttribute("x2", e.target.x);
        line.setAttribute("y2", e.target.y);
      });
      nodeEls.forEach((g, i) => {
        const n = d3nodes[i];
        g.setAttribute("transform", `translate(${n.x},${n.y})`);
      });
      flowEls.forEach((pathEl, i) => {
        const seg = flowSegments[i];
        const a = nodeById.get(seg.fromId);
        const b = nodeById.get(seg.toId);
        if (a && b && a.x != null && b.x != null) {
          pathEl.setAttribute("d", `M ${a.x} ${a.y} L ${b.x} ${b.y}`);
        } else {
          pathEl.setAttribute("d", "");
        }
      });
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, flows, enabledIds]);

  // Apply / clear selection + path highlight.
  useEffect(() => {
    const linkEls = linkElsRef.current;
    const nodeEls = nodeElsRef.current;
    const d3edges = d3edgesRef.current;
    const d3nodes = d3nodesRef.current;
    if (!linkEls.length || !nodeEls.length) return;

    // Default styling.
    linkEls.forEach((l, i) => {
      l.classList.remove("arch-link-onpath");
      const e = d3edges[i];
      l.setAttribute(
        "stroke",
        e.kind === "page_link" ? "#3b82f6" : "#94a3b8"
      );
      l.setAttribute("stroke-width", e.kind === "page_link" ? 1.5 : 1);
      l.setAttribute("opacity", "0.55");
    });
    nodeEls.forEach((g) => {
      g.classList.remove("arch-node-selected");
      const c = g.querySelector("circle");
      if (c) c.setAttribute("stroke", "#ffffff");
    });

    // Highlight selected nodes.
    selected.forEach((id) => {
      const idx = d3nodes.findIndex((n) => n.id === id);
      if (idx >= 0) {
        const g = nodeEls[idx];
        g.classList.add("arch-node-selected");
        const c = g.querySelector("circle");
        if (c) c.setAttribute("stroke", "#fbbf24");
      }
    });

    // Path animation between two selected nodes.
    if (selected.length === 2) {
      const path = bfsPath(d3nodes, d3edges, selected[0], selected[1]);
      if (path && path.length > 1) {
        const pairKey = (a, b) => (a < b ? `${a}__${b}` : `${b}__${a}`);
        const onPath = new Set();
        for (let i = 0; i < path.length - 1; i++) {
          onPath.add(pairKey(path[i], path[i + 1]));
        }
        linkEls.forEach((l, i) => {
          const e = d3edges[i];
          const sId = typeof e.source === "string" ? e.source : e.source.id;
          const tId = typeof e.target === "string" ? e.target : e.target.id;
          if (onPath.has(pairKey(sId, tId))) {
            l.classList.add("arch-link-onpath");
          }
        });
      }
    }
  }, [selected]);

  const pathStatus = useMemo(() => {
    if (selected.length === 0) return "Click a node to start path-tracing.";
    if (selected.length === 1) {
      return "Click another node to find the connecting path.";
    }
    const path = bfsPath(d3nodesRef.current, d3edgesRef.current, selected[0], selected[1]);
    if (!path) return "No connecting path between selected nodes.";
    return `Connecting path: ${path.length - 1} hop${path.length === 2 ? "" : "s"}`;
  }, [selected]);

  return (
    <div className="arch-view-overlay">
      <div className="arch-view-header">
        <span className="arch-view-title">🕸 Linkage view</span>
        <div className="arch-view-filters">
          <select
            value={filter.tag}
            onChange={(e) => setFilter((f) => ({ ...f, tag: e.target.value }))}
          >
            <option value="">All tags</option>
            {Object.keys(TAG_COLOR).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            value={filter.fid}
            onChange={(e) => setFilter((f) => ({ ...f, fid: e.target.value }))}
          >
            <option value="">All FIDs</option>
            {fids.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <label className="arch-view-checkbox">
            <input
              type="checkbox"
              checked={filter.hasAttach}
              onChange={(e) =>
                setFilter((f) => ({ ...f, hasAttach: e.target.checked }))
              }
            />
            Has attachments
          </label>
          <button
            className="arch-btn"
            onClick={() => setSelected([])}
            disabled={selected.length === 0}
            title="Clear selection"
          >
            Clear
          </button>
        </div>
        <button className="arch-btn" onClick={onClose}>✕ Close</button>
      </div>
      <svg ref={svgRef} className="arch-view-svg" />
      <div className="arch-view-legend">
        <div>
          📄 page nodes (dark blue) · object nodes coloured by tag · solid grey
          = same-page edge · dashed blue = cross-page link · enabled data
          flows animate as marching coloured paths.
        </div>
        <div>{pathStatus}</div>
      </div>
    </div>
  );
}
