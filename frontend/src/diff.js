// Compute a renderable diff between two page states.
//
// Each page state is the on-disk JSON: { objects: [...], viewport: {...} }
// where every object has type ∈ {"box", "stamp", "edge"}.
//
// Returns:
//   {
//     nodes: [...],           // React Flow nodes annotated with _diffKind
//     edges: [...],           // React Flow edges annotated with _diffKind
//     summary: { added, removed, moved, changed, unchanged },
//     details: { [object_id]: { kind, fields: {<field>: [a, b]} } },
//   }
//
// _diffKind values used by BoxNode / StampNode / ArchEdge:
//   "added"        — only in B
//   "removed"      — only in A (rendered at A's position, ghosted)
//   "moved"        — in both, position differs only
//   "changed"      — in both, non-position fields differ (may also have moved)
//   "unchanged"    — in both, identical
//   "moved-ghost"  — companion ghost at the old position for moved/changed nodes

const COMPARED_FIELDS = [
  "label",
  "color_tag",
  "fid",
  "link_to_page",
  "stamp_id",
  // edge-specific:
  "from",
  "to",
];

function fieldsDiff(a, b) {
  const out = {};
  for (const f of COMPARED_FIELDS) {
    const va = a?.[f] ?? null;
    const vb = b?.[f] ?? null;
    if (va !== vb) out[f] = [va, vb];
  }
  return out;
}

function classifyObject(a, b) {
  if (!a && b) return { kind: "added", fields: {} };
  if (a && !b) return { kind: "removed", fields: {} };
  const fields = fieldsDiff(a, b);
  const moved =
    a.type !== "edge" && (a.x !== b.x || a.y !== b.y);
  if (Object.keys(fields).length === 0 && !moved) {
    return { kind: "unchanged", fields: {} };
  }
  if (Object.keys(fields).length === 0 && moved) {
    return { kind: "moved", fields: {} };
  }
  return { kind: "changed", fields };
}

function objToDiffNode(obj, kind, ghost = false) {
  // Mirrors objToNode in App.jsx but adds _diffKind for renderers.
  return {
    id: ghost ? `${obj.id}__ghost` : obj.id,
    type: obj.type,
    position: { x: obj.x ?? 0, y: obj.y ?? 0 },
    data: {
      label: obj.label || "",
      colorTag: obj.color_tag || null,
      fid: obj.fid || null,
      linkToPage: obj.link_to_page || null,
      stampId: obj.stamp_id || null,
      _diffKind: ghost ? "moved-ghost" : kind,
    },
    draggable: false,
    selectable: !ghost,
  };
}

function objToDiffEdge(obj, kind) {
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
      _diffKind: kind,
    },
  };
}

export function computeDiff(stateA, stateB) {
  const objsA = (stateA?.objects || []);
  const objsB = (stateB?.objects || []);
  const mapA = new Map(objsA.map((o) => [o.id, o]));
  const mapB = new Map(objsB.map((o) => [o.id, o]));
  const allIds = new Set([...mapA.keys(), ...mapB.keys()]);

  const nodes = [];
  const edges = [];
  const summary = {
    added: 0,
    removed: 0,
    moved: 0,
    changed: 0,
    unchanged: 0,
  };
  const details = {};

  for (const id of allIds) {
    const a = mapA.get(id);
    const b = mapB.get(id);
    const cls = classifyObject(a, b);
    summary[cls.kind] = (summary[cls.kind] || 0) + 1;
    details[id] = { kind: cls.kind, fields: cls.fields };

    const display = b || a; // for "removed", we render A
    const isEdge = display.type === "edge";

    if (isEdge) {
      edges.push(objToDiffEdge(display, cls.kind));
    } else {
      nodes.push(objToDiffNode(display, cls.kind));
      // For moved/changed-with-move, drop a ghost at the old position too.
      if (
        a &&
        b &&
        (cls.kind === "moved" || (cls.kind === "changed" && (a.x !== b.x || a.y !== b.y)))
      ) {
        nodes.push(objToDiffNode(a, cls.kind, true));
      }
    }
  }

  return { nodes, edges, summary, details };
}

const FIELD_LABELS = {
  label: "Label",
  color_tag: "Color tag",
  fid: "Function ID",
  link_to_page: "Link to page",
  stamp_id: "Stamp icon",
  from: "From",
  to: "To",
};

export function fieldLabel(f) {
  return FIELD_LABELS[f] || f;
}
