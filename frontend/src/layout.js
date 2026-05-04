import dagre from "dagre";

// Default sizes for each node type — must match what the node components
// actually render so dagre can leave the right amount of breathing room.
const NODE_SIZES = {
  box: { w: 160, h: 56 },
  stamp: { w: 80, h: 80 },
  text: { w: 80, h: 22 },
};

/**
 * Run dagre on the supplied React Flow nodes + edges and return new nodes
 * with updated positions. Text annotations are left untouched (they're
 * decorative free-floating labels, not part of the architecture graph).
 */
export function tidyLayout(nodes, edges, direction = "LR") {
  const annotations = nodes.filter((n) => n.type === "text");
  const layoutable = nodes.filter((n) => n.type !== "text");
  if (layoutable.length === 0) return nodes;

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    nodesep: 60,
    ranksep: 100,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  layoutable.forEach((n) => {
    const { w, h } = NODE_SIZES[n.type] || NODE_SIZES.box;
    g.setNode(n.id, { width: w, height: h });
  });

  const layoutableIds = new Set(layoutable.map((n) => n.id));
  (edges || []).forEach((e) => {
    if (layoutableIds.has(e.source) && layoutableIds.has(e.target)) {
      g.setEdge(e.source, e.target);
    }
  });

  dagre.layout(g);

  const repositioned = layoutable.map((n) => {
    const ln = g.node(n.id);
    if (!ln) return n;
    return {
      ...n,
      position: { x: ln.x - ln.width / 2, y: ln.y - ln.height / 2 },
    };
  });

  return [...repositioned, ...annotations];
}
