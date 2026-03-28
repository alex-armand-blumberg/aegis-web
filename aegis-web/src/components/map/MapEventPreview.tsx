"use client";

import type { IntelLayerKey, IntelPoint } from "@/lib/intel/types";

const LAYER_DISPLAY: Partial<Record<IntelLayerKey, string>> = {
  conflictsBattles: "Battle",
  conflictsExplosions: "Explosion",
  conflictsCivilians: "Civilian impact",
  conflictsStrategic: "Strategic",
  conflictsProtests: "Protest",
  conflictsRiots: "Riot",
  liveStrikes: "Live strike",
  flights: "Flight",
  vessels: "Vessel",
  carriers: "Carrier",
  news: "News",
  escalationRisk: "Risk",
  hotspots: "Hotspot",
  infrastructure: "Infrastructure",
  conflicts: "Conflict",
  troopMovements: "Troop movement",
};

type MapEventPreviewProps = {
  point: IntelPoint;
  x: number;
  y: number;
  onOpenBrief: () => void;
  onDismiss: () => void;
};

export function MapEventPreview({ point, x, y, onOpenBrief, onDismiss }: MapEventPreviewProps) {
  const typeLabel = LAYER_DISPLAY[point.layer] ?? point.layer;
  const conf =
    typeof point.confidence === "number" ? `${Math.round(point.confidence * 100)}% confidence` : null;

  const pad = 12;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = Math.min(Math.max(pad, x + 12), vw - 320 - pad);
  const top = Math.min(Math.max(pad, y + 12), vh - 200 - pad);

  return (
    <>
      <button type="button" className="map-event-preview-backdrop" aria-label="Dismiss" onClick={onDismiss} />
      <div className="map-event-preview" style={{ left, top }}>
        <div className="map-event-preview-kicker">{typeLabel}</div>
        <div className="map-event-preview-title">{point.title}</div>
        <div className="map-event-preview-rows">
          <span>Source</span>
          <strong>{point.source}</strong>
          <span>Severity</span>
          <strong className="map-event-preview-sev">{point.severity}</strong>
          {conf ? (
            <>
              <span>Confidence</span>
              <strong>{conf}</strong>
            </>
          ) : null}
          <span>Time</span>
          <strong>{new Date(point.timestamp).toLocaleString()}</strong>
        </div>
        <div className="map-event-preview-actions">
          <button type="button" className="map-event-preview-cta" onClick={onOpenBrief}>
            Open full brief
          </button>
        </div>
      </div>
    </>
  );
}
