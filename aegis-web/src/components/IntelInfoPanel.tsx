"use client";

import type { IntelPoint, ProviderHealth } from "@/lib/intel/types";

type IntelInfoPanelProps = {
  point: IntelPoint;
  providerHealth: ProviderHealth[];
  aiSummary?: string;
  aiLoading?: boolean;
  onClose: () => void;
};

function severityColor(severity: IntelPoint["severity"]): string {
  switch (severity) {
    case "critical":
      return "#ef4444";
    case "high":
      return "#f97316";
    case "medium":
      return "#f59e0b";
    default:
      return "#60a5fa";
  }
}

/** Human-readable labels for common metadata keys (API still uses snake_case). */
const METADATA_LABELS: Record<string, string> = {
  origin_country: "Origin country",
  aircraft_platform: "Aircraft type",
  vessel_class: "Vessel type",
  vessel_category: "Vessel category",
  purpose: "Mission / role",
  aircraft_role: "Mission / role",
  troop_unit_hint: "Unit / formation (hint)",
  unit_or_branch: "Unit / branch",
  branch_or_unit: "Unit / branch",
  ais_flag: "AIS flag (raw)",
  flag_country: "Flag country",
  speed_knots: "Speed (kn)",
  speed_kts: "Speed (kn)",
  velocity_ms: "Speed (m/s)",
  altitude_m: "Altitude (m)",
  heading_deg: "Heading (°)",
  vertical_rate_ms: "Vertical rate (m/s)",
  squawk: "Squawk",
  icao24: "ICAO24",
  hex: "Mode S hex",
  callsign: "Callsign",
  mmsi: "MMSI / id",
  inferred_military_movement: "Military-like movement",
  on_ground: "On ground",
  mmsi_country: "Country (from MMSI)",
  name_inferred_country: "Country (from vessel name)",
  aircraft_type_extra: "Aircraft type (ADS-B)",
  registration: "Registration",
};

function formatMetadataLabel(key: string): string {
  return METADATA_LABELS[key] ?? key.replaceAll("_", " ");
}

function readMetaString(
  meta: IntelPoint["metadata"],
  keys: string[]
): string | undefined {
  if (!meta) return undefined;
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

export default function IntelInfoPanel({
  point,
  providerHealth,
  aiSummary,
  aiLoading = false,
  onClose,
}: IntelInfoPanelProps) {
  const health = providerHealth.find((p) => point.source.includes(p.provider));
  const imageUrl =
    point.imageUrl ||
    (typeof point.metadata?.image_url === "string" ? point.metadata.image_url : "");
  const aiBulletLines = (aiSummary ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*•]\s*/, ""));

  const displayCountry =
    point.country ||
    readMetaString(point.metadata, ["country", "origin_country", "flag_country"]);
  const aircraftOrHeloType = readMetaString(point.metadata, [
    "aircraft_platform",
    "aircraft_type",
  ]);
  const vesselType = readMetaString(point.metadata, [
    "vessel_class",
    "vessel_category",
  ]);
  const troopUnitHint = readMetaString(point.metadata, [
    "troop_unit_hint",
    "unit_or_branch",
    "branch_or_unit",
  ]);
  const platformSummary =
    point.layer === "flights"
      ? aircraftOrHeloType
      : point.layer === "vessels" || point.layer === "carriers"
        ? vesselType
        : point.layer === "infrastructure" || point.layer === "troopMovements"
          ? troopUnitHint
          : undefined;

  const metadataEntries = point.metadata ? Object.entries(point.metadata) : [];
  const hiddenMetadataKeys = new Set([
    "country",
    "origin_country",
    "flag_country",
    "aircraft_type",
    "aircraft_platform",
    "aircraft_type",
    "vessel_class",
    "vessel_category",
    "troop_unit_hint",
    "unit_or_branch",
    "branch_or_unit",
  ]);

  return (
    <aside className="intel-side-panel">
      <button type="button" className="intel-side-close" onClick={onClose}>
        x
      </button>
      <div className="intel-side-header">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={point.title}
            className="intel-side-image"
          />
        ) : null}
        <div className="intel-side-kicker">{point.layer.toUpperCase()}</div>
        <h3>{point.title}</h3>
        <p>{point.subtitle || point.country || "Global signal"}</p>
      </div>

      <div className="intel-side-grid">
        <div className="intel-side-item">
          <span>Country</span>
          <strong>{displayCountry ?? "Unknown / not resolved"}</strong>
        </div>
        {platformSummary ? (
          <div className="intel-side-item">
            <span>
              {point.layer === "flights"
                ? "Aircraft type"
                : point.layer === "vessels" || point.layer === "carriers"
                  ? "Vessel type"
                  : "Unit / branch"}
            </span>
            <strong>{platformSummary}</strong>
          </div>
        ) : null}
        <div className="intel-side-item">
          <span>Severity</span>
          <strong style={{ color: severityColor(point.severity) }}>
            {point.severity.toUpperCase()}
          </strong>
        </div>
        <div className="intel-side-item">
          <span>Source</span>
          <strong>{point.source}</strong>
        </div>
        <div className="intel-side-item">
          <span>Updated</span>
          <strong>{new Date(point.timestamp).toLocaleString()}</strong>
        </div>
        <div className="intel-side-item">
          <span>Confidence</span>
          <strong>
            {typeof point.confidence === "number"
              ? `${Math.round(point.confidence * 100)}%`
              : "N/A"}
          </strong>
        </div>
      </div>

      {metadataEntries.length > 0 && (
        <div className="intel-side-metadata">
          <div className="intel-side-subtitle">Signal data</div>
          {metadataEntries
            .filter(([k]) => !hiddenMetadataKeys.has(k))
            .map(([k, v]) => (
              <div key={k} className="intel-side-item">
                <span>{formatMetadataLabel(k)}</span>
                <strong>{String(v)}</strong>
              </div>
            ))}
        </div>
      )}

      <div className="intel-side-metadata">
        <div className="intel-side-subtitle">Provider status</div>
        {providerHealth.map((h) => (
          <div key={h.provider} className="intel-side-item">
            <span>{h.provider}</span>
            <strong style={{ color: h.ok ? "#22c55e" : "#ef4444" }}>
              {h.ok ? "OK" : "DEGRADED"}
            </strong>
          </div>
        ))}
      </div>

      {health?.message && <p className="intel-side-note">{health.message}</p>}

      <div className="intel-side-metadata">
        <div className="intel-side-subtitle">AI event briefing</div>
        {aiLoading ? (
          <p className="intel-side-note">Generating AI summary...</p>
        ) : aiBulletLines.length > 0 ? (
          <ul className="intel-side-note-list">
            {aiBulletLines.map((line, idx) => (
              <li key={`${point.id}-ai-${idx}`}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="intel-side-note">No AI summary yet.</p>
        )}
      </div>
    </aside>
  );
}
