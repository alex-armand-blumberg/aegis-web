"use client";

import { useEffect, useMemo, useState } from "react";
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

const articleImageCache = new Map<string, string | null>();

const eventHeroImageCache = new Map<string, string | null>();

const USED_HERO_IMAGES_SESSION_KEY = "aegis-hero-used-images";
const USED_HERO_IMAGES_MAX = 40;

function readUsedHeroImagesFromSession(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(USED_HERO_IMAGES_SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => typeof x === "string" && x.startsWith("http"));
  } catch {
    return [];
  }
}

function pushUsedHeroImageToSession(url: string) {
  if (typeof window === "undefined") return;
  if (!url.startsWith("http")) return;
  try {
    const current = readUsedHeroImagesFromSession();
    const next = [...current.filter((u) => u !== url), url].slice(-USED_HERO_IMAGES_MAX);
    window.sessionStorage.setItem(USED_HERO_IMAGES_SESSION_KEY, JSON.stringify(next));
  } catch {
    // Best-effort only.
  }
}

function heroPlaceholderForPoint(point: IntelPoint): string {
  switch (point.layer) {
    case "news":
      return "/satellite-earth.png";
    case "liveStrikes":
      return "/limitations-bg.png";
    case "conflicts":
      return "/earth-bg.png";
    default:
      return "/icon.png";
  }
}

export default function IntelInfoPanel({
  point,
  providerHealth,
  aiSummary,
  aiLoading = false,
  onClose,
}: IntelInfoPanelProps) {
  const health = providerHealth.find((p) => point.source.includes(p.provider));
  const fromPointImage =
    point.imageUrl ||
    (typeof point.metadata?.image_url === "string" ? point.metadata.image_url.trim() : "");
  const sourceUrl = readMetaString(point.metadata, ["source_url", "article_url", "link"]) ?? "";

  const [resolvedArticleImage, setResolvedArticleImage] = useState<string | null>(null);
  const [articleImageLoading, setArticleImageLoading] = useState(false);
  const [articleImageLookupDone, setArticleImageLookupDone] = useState(false);

  const [resolvedEventImage, setResolvedEventImage] = useState<string | null>(null);
  const [eventHeroImageLoading, setEventHeroImageLoading] = useState(false);

  const cacheKey = useMemo(
    () => `${point.id}:${sourceUrl}`,
    [point.id, sourceUrl]
  );

  useEffect(() => {
    setArticleImageLookupDone(false);
    setResolvedArticleImage(null);
    setArticleImageLoading(false);
    setResolvedEventImage(null);
    setEventHeroImageLoading(false);

    if (fromPointImage) {
      setArticleImageLookupDone(true);
      return;
    }

    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
      setArticleImageLookupDone(true);
      return;
    }

    const cached = articleImageCache.get(sourceUrl);
    if (cached !== undefined) {
      setResolvedArticleImage(cached);
      setArticleImageLookupDone(true);
      return;
    }

    let cancelled = false;
    const debounce = window.setTimeout(() => {
      setArticleImageLoading(true);
      const params = new URLSearchParams({ url: sourceUrl });
      fetch(`/api/map/article-image?${params.toString()}`)
        .then(async (res) => {
          if (!res.ok) return null;
          const data = (await res.json()) as { imageUrl?: string };
          const u = typeof data.imageUrl === "string" ? data.imageUrl.trim() : "";
          return u || null;
        })
        .then((url) => {
          articleImageCache.set(sourceUrl, url);
          if (!cancelled) {
            setResolvedArticleImage(url);
            setArticleImageLoading(false);
            setArticleImageLookupDone(true);
          }
        })
        .catch(() => {
          articleImageCache.set(sourceUrl, null);
          if (!cancelled) {
            setResolvedArticleImage(null);
            setArticleImageLoading(false);
            setArticleImageLookupDone(true);
          }
        });
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(debounce);
    };
  }, [cacheKey, fromPointImage, sourceUrl]);

  const eventCacheKey = useMemo(
    () => `${point.layer}|${point.id}`.slice(0, 220),
    [point.layer, point.id]
  );

  useEffect(() => {
    setResolvedEventImage(null);
    setEventHeroImageLoading(false);

    // Only try "event-hero-image" when:
    // - we don't already have a direct image from the point
    // - the article-image lookup has completed and returned null
    if (fromPointImage) return;
    if (!articleImageLookupDone) return;
    if (resolvedArticleImage) return;

    const used = readUsedHeroImagesFromSession();
    const exclude = used.slice(-30);
    const excludeSet = new Set(exclude);

    const cached = eventHeroImageCache.get(eventCacheKey);
    if (cached !== undefined) {
      if (cached && !excludeSet.has(cached)) setResolvedEventImage(cached);
      return;
    }

    let cancelled = false;
    const debounce = window.setTimeout(async () => {
      setEventHeroImageLoading(true);
      const eventType = readMetaString(point.metadata, ["event_type", "eventType"]) ?? "";
      const originalHeadline =
        readMetaString(point.metadata, ["original_headline"]) ?? readMetaString(point.metadata, ["headline"]);
      const titleForSearch =
        point.layer === "hotspots"
          ? `${point.country ?? ""} conflict escalation`
          : (originalHeadline ?? point.title).slice(0, 120);
      const params = new URLSearchParams({
        title: titleForSearch,
        country: point.country ?? "",
        layer: point.layer,
        eventType,
        exclude: exclude.join(","),
      });
      try {
        const res = await fetch(`/api/map/event-hero-image?${params.toString()}`);
        if (!res.ok) {
          eventHeroImageCache.set(eventCacheKey, null);
          if (!cancelled) setEventHeroImageLoading(false);
          return;
        }
        const data = (await res.json()) as { imageUrl?: string };
        const url = typeof data.imageUrl === "string" ? data.imageUrl.trim() : "";
        if (!url) {
          eventHeroImageCache.set(eventCacheKey, null);
          if (!cancelled) setEventHeroImageLoading(false);
          return;
        }

        eventHeroImageCache.set(eventCacheKey, url);
        pushUsedHeroImageToSession(url);
        if (!cancelled) {
          setResolvedEventImage(url);
          setEventHeroImageLoading(false);
        }
      } catch {
        eventHeroImageCache.set(eventCacheKey, null);
        if (!cancelled) setEventHeroImageLoading(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(debounce);
    };
  }, [
    eventCacheKey,
    fromPointImage,
    point.layer,
    point.title,
    point.country,
    point.metadata,
    resolvedArticleImage,
    sourceUrl,
    articleImageLookupDone,
  ]);

  const imageUrl = fromPointImage || resolvedArticleImage || resolvedEventImage || null;

  // Record successful online hero images so subsequent searches avoid repeats.
  useEffect(() => {
    if (!imageUrl) return;
    if (imageUrl.startsWith("/")) return; // local placeholders/assets
    if (!imageUrl.startsWith("http")) return;
    pushUsedHeroImageToSession(imageUrl);
  }, [imageUrl]);

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
    "source_url",
    "article_url",
    "link",
    "image_url",
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
        {(articleImageLoading || eventHeroImageLoading) && !fromPointImage ? (
          <div className="intel-side-image intel-side-image-loading" aria-hidden />
        ) : null}
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={point.title}
            className="intel-side-image"
          />
        ) : null}
        <div className="intel-side-kicker">
          {point.layer === "carriers" ? "CARRIERS · WIP" : point.layer.toUpperCase()}
        </div>
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
