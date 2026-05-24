"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExposureAlert, UserAsset } from "@/lib/impact/types";
import type { SelectedAssetEvent } from "@/lib/impact/eventLayer";
import {
  buildNetworkGraph,
  clearNodeDeltas,
  loadNodeDeltas,
  saveNodeDelta,
} from "./networkGraphUtils";
import {
  applyDeltas,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  clampPosition,
  computeDefaultPositions,
  computeDelta,
  edgeAttach,
  edgeCssClass,
  LEGEND_ITEMS,
  nodeCentre,
  nodeCssClass,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "./networkLayout";

type Props = {
  asset: UserAsset;
  activeEvents: SelectedAssetEvent[];
  alert: ExposureAlert | null;
  loading?: boolean;
};

type DragState = {
  nodeId: string;
  startPointerX: number;
  startPointerY: number;
  startNodeX: number;
  startNodeY: number;
};

export function NetworkGraph({ asset, activeEvents, alert, loading }: Props) {
  const graph = useMemo(
    () => buildNetworkGraph({ asset, activeEvents, alert }),
    [asset, activeEvents, alert]
  );

  const defaultPositions = useMemo(
    () => computeDefaultPositions(graph),
    [graph]
  );

  const [positions, setPositions] = useState(() => {
    const deltas = loadNodeDeltas(asset.id);
    return applyDeltas(defaultPositions, deltas);
  });

  // Re-apply layout when asset or graph shape changes
  useEffect(() => {
    const deltas = loadNodeDeltas(asset.id);
    setPositions(applyDeltas(defaultPositions, deltas));
  }, [asset.id, defaultPositions]);

  const dragRef = useRef<DragState | null>(null);
  const frameRef = useRef<number | null>(null);

  const handlePointerDown = useCallback(
    (nodeId: string, e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const pos = positions[nodeId];
      if (!pos) return;
      dragRef.current = {
        nodeId,
        startPointerX: e.clientX,
        startPointerY: e.clientY,
        startNodeX: pos.x,
        startNodeY: pos.y,
      };
    },
    [positions]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      const { nodeId, startPointerX, startPointerY, startNodeX, startNodeY } = dragRef.current;
      const dx = e.clientX - startPointerX;
      const dy = e.clientY - startPointerY;
      const rawX = startNodeX + dx;
      const rawY = startNodeY + dy;
      const clamped = clampPosition(rawX, rawY);

      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        setPositions((prev) => ({ ...prev, [nodeId]: clamped }));
        frameRef.current = null;
      });
    },
    []
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      const { nodeId, startPointerX, startPointerY, startNodeX, startNodeY } = dragRef.current;
      const dx = e.clientX - startPointerX;
      const dy = e.clientY - startPointerY;
      const clamped = clampPosition(startNodeX + dx, startNodeY + dy);
      const delta = computeDelta(defaultPositions, nodeId, clamped.x, clamped.y);
      saveNodeDelta(asset.id, nodeId, delta.dx, delta.dy);
      setPositions((prev) => ({ ...prev, [nodeId]: clamped }));
      dragRef.current = null;
    },
    [asset.id, defaultPositions]
  );

  const handleReset = useCallback(() => {
    clearNodeDeltas(asset.id);
    setPositions({ ...defaultPositions });
  }, [asset.id, defaultPositions]);

  // Compute SVG edge paths from current positions
  const edgeLines = useMemo(() => {
    return graph.edges.map((edge) => {
      const fromPos = positions[edge.fromId];
      const toPos = positions[edge.toId];
      if (!fromPos || !toPos) return null;
      const toCentre = nodeCentre(toPos);
      const fromCentre = nodeCentre(fromPos);
      const from = edgeAttach(fromPos, toCentre);
      const to = edgeAttach(toPos, fromCentre);
      return { edge, from, to };
    });
  }, [graph.edges, positions]);

  if (loading) {
    return (
      <div className="iv-net-canvas" aria-busy="true" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
        <div className="iv-net-loading">
          <div className="iv-dash-skeleton iv-dash-skeleton-title" style={{ width: 220 }} />
          <div className="iv-dash-skeleton iv-dash-skeleton-row" style={{ width: 320 }} />
          <div className="iv-dash-skeleton iv-dash-skeleton-row" style={{ width: 280 }} />
        </div>
      </div>
    );
  }

  if (graph.nodes.length <= 1 && activeEvents.length === 0) {
    return (
      <div className="iv-net-canvas iv-net-empty" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
        <p className="iv-meta iv-net-empty-copy">
          No relationship data for this asset in the selected range.
        </p>
      </div>
    );
  }

  return (
    <div className="iv-net-wrap">
      {/* Legend + controls */}
      <div className="iv-net-header">
        <div className="iv-net-legend" aria-label="Node type legend">
          {LEGEND_ITEMS.map((item) => (
            <span key={item.kind} className={`iv-net-legend-item iv-net-legend-${item.kind}`}>
              {item.label}
            </span>
          ))}
        </div>
        <button
          type="button"
          className="iv-net-reset-btn"
          onClick={handleReset}
          aria-label="Reset graph layout to default positions"
        >
          Reset layout
        </button>
      </div>

      {/* Graph canvas: SVG edges behind, nodes on top */}
      <div
        className="iv-net-canvas"
        style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, position: "relative" }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* SVG edge layer */}
        <svg
          className="iv-net-svg"
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
          aria-hidden
        >
          {edgeLines.map((line) => {
            if (!line) return null;
            const { edge, from, to } = line;
            const mx = (from.x + to.x) / 2;
            const my = (from.y + to.y) / 2;
            return (
              <g key={edge.id} className={edgeCssClass(edge.kind)}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  className="iv-net-edge-line"
                />
                <text
                  x={mx}
                  y={my - 5}
                  className="iv-net-edge-label"
                  textAnchor="middle"
                >
                  {edge.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Node cards */}
        {graph.nodes.map((node) => {
          const pos = positions[node.id];
          if (!pos) return null;
          return (
            <div
              key={node.id}
              className={nodeCssClass(node)}
              style={{
                position: "absolute",
                left: pos.x,
                top: pos.y,
                width: NODE_WIDTH,
                minHeight: NODE_HEIGHT,
                cursor: "grab",
                userSelect: "none",
              }}
              onPointerDown={(e) => handlePointerDown(node.id, e)}
              role="presentation"
            >
              <span className="iv-net-node-label">{node.label}</span>
              {node.sublabel ? (
                <span className="iv-net-node-sublabel">{node.sublabel}</span>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Driver caveat if shown */}
      {!alert && activeEvents.length > 0 ? (
        <p className="iv-meta iv-net-driver-note">
          Exposure score pending — risk driver nodes unavailable.
        </p>
      ) : null}
    </div>
  );
}
