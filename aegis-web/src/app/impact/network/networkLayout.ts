import type { NetworkGraph, NetworkNode, NodePosition, NodePositionMap } from "./networkGraphUtils";

// ── Canvas dimensions ─────────────────────────────────────────────────────────

export const CANVAS_WIDTH = 900;
export const CANVAS_HEIGHT = 520;
export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 56;

// Column x-anchor (left edge of node)
const COL_ASSET = 40;
const COL_EVENTS = 290;
const COL_SOURCES = 580;
const COL_DRIVERS_X = 40;

// Starting y for each column
const CENTER_Y = CANVAS_HEIGHT / 2;

/**
 * Compute default positions for all nodes based on their kind.
 * Events are stacked in the middle column, sources on the right,
 * drivers below the asset on the left.
 */
export function computeDefaultPositions(graph: NetworkGraph): NodePositionMap {
  const positions: NodePositionMap = {};

  const eventNodes = graph.nodes.filter((n) => n.kind === "event");
  const sourceNodes = graph.nodes.filter((n) => n.kind === "source");
  const driverNodes = graph.nodes.filter((n) => n.kind === "driver");
  const assetNode = graph.nodes.find((n) => n.kind === "asset");

  // Asset — left, vertically centered
  if (assetNode) {
    positions[assetNode.id] = {
      x: COL_ASSET,
      y: CENTER_Y - NODE_HEIGHT / 2,
    };
  }

  // Events — middle column, stacked
  const eventGap = 72;
  const eventTotalH = eventNodes.length * NODE_HEIGHT + (eventNodes.length - 1) * (eventGap - NODE_HEIGHT);
  let eventStartY = Math.max(20, CENTER_Y - eventTotalH / 2);
  for (const node of eventNodes) {
    positions[node.id] = { x: COL_EVENTS, y: eventStartY };
    eventStartY += eventGap;
  }

  // Sources — right column, stacked
  const sourceGap = 76;
  const sourceTotalH = sourceNodes.length * NODE_HEIGHT + (sourceNodes.length - 1) * (sourceGap - NODE_HEIGHT);
  let sourceStartY = Math.max(20, CENTER_Y - sourceTotalH / 2);
  for (const node of sourceNodes) {
    positions[node.id] = { x: COL_SOURCES, y: sourceStartY };
    sourceStartY += sourceGap;
  }

  // Drivers — bottom-left, row under asset
  let driverX = COL_DRIVERS_X;
  const driverY = CENTER_Y + NODE_HEIGHT + 32;
  for (const node of driverNodes) {
    positions[node.id] = { x: driverX, y: driverY };
    driverX += NODE_WIDTH + 16;
  }

  return positions;
}

/**
 * Merge default positions with stored drag deltas.
 */
export function applyDeltas(
  defaults: NodePositionMap,
  deltas: Record<string, { dx: number; dy: number }>
): NodePositionMap {
  const result: NodePositionMap = {};
  for (const [id, pos] of Object.entries(defaults)) {
    const delta = deltas[id];
    result[id] = delta
      ? { x: pos.x + delta.dx, y: pos.y + delta.dy }
      : { ...pos };
  }
  return result;
}

/**
 * Centre of a node rect, used for drawing SVG edge endpoints.
 */
export function nodeCentre(pos: NodePosition): { cx: number; cy: number } {
  return { cx: pos.x + NODE_WIDTH / 2, cy: pos.y + NODE_HEIGHT / 2 };
}

/**
 * Compute the edge point on the border of a node rect nearest to a target point.
 */
export function edgeAttach(
  pos: NodePosition,
  target: { cx: number; cy: number }
): { x: number; y: number } {
  const cx = pos.x + NODE_WIDTH / 2;
  const cy = pos.y + NODE_HEIGHT / 2;

  const dx = target.cx - cx;
  const dy = target.cy - cy;

  const hw = NODE_WIDTH / 2;
  const hh = NODE_HEIGHT / 2;

  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
    return { x: cx, y: cy };
  }

  const scaleX = Math.abs(dx) > 0 ? hw / Math.abs(dx) : Infinity;
  const scaleY = Math.abs(dy) > 0 ? hh / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);

  return { x: cx + dx * scale, y: cy + dy * scale };
}

/**
 * Compute stable node key → deltas for an in-progress drag.
 * Returns the delta from the default layout position (not from previous drag position).
 */
export function computeDelta(
  defaults: NodePositionMap,
  nodeId: string,
  newX: number,
  newY: number
): { dx: number; dy: number } {
  const def = defaults[nodeId];
  if (!def) return { dx: 0, dy: 0 };
  return { dx: newX - def.x, dy: newY - def.y };
}

// ── Clamp helpers ─────────────────────────────────────────────────────────────

export function clampPosition(x: number, y: number): NodePosition {
  const maxX = CANVAS_WIDTH - NODE_WIDTH;
  const maxY = CANVAS_HEIGHT - NODE_HEIGHT;
  return {
    x: Math.max(0, Math.min(maxX, x)),
    y: Math.max(0, Math.min(maxY, y)),
  };
}

// ── Legend items ──────────────────────────────────────────────────────────────

export type LegendItem = { kind: string; label: string };

export const LEGEND_ITEMS: LegendItem[] = [
  { kind: "asset", label: "Asset" },
  { kind: "event", label: "Event" },
  { kind: "source", label: "Source" },
  { kind: "driver", label: "Risk Driver" },
];

// ── Node kind colour helpers ──────────────────────────────────────────────────

export function nodeCssClass(node: NetworkNode): string {
  const base = `iv-net-node iv-net-node-${node.kind}`;
  if (node.kind === "event" && node.severity) {
    return `${base} iv-net-node-severity-${node.severity}`;
  }
  return base;
}

export function edgeCssClass(kind: string): string {
  return `iv-net-edge iv-net-edge-${kind}`;
}
