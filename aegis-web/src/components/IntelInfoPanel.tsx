"use client";

import { useEffect, useMemo, useState } from "react";
import { IntelBriefTabPanel, IntelBriefTabs, type IntelBriefTabId } from "@/components/map/IntelBriefTabs";
import type { IntelPoint, ProviderHealth } from "@/lib/intel/types";
import { INTEL_LAYER_LABELS } from "@/lib/intel/layerLabels";
import { StatusChip } from "@/components/ui/StatusChip";

type IntelInfoPanelProps = {
  point: IntelPoint;
  providerHealth: ProviderHealth[];
  aiSummary?: string;
  aiLoading?: boolean;
  onClose: () => void;
};

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
    /* eslint-disable react-hooks/set-state-in-effect -- reset image pipeline when point / URL changes */
    setArticleImageLookupDone(false);
    setResolvedArticleImage(null);
    setArticleImageLoading(false);
    setResolvedEventImage(null);
    setEventHeroImageLoading(false);
    /* eslint-enable react-hooks/set-state-in-effect */

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
    /* eslint-disable react-hooks/set-state-in-effect -- reset event hero when dependencies change */
    setResolvedEventImage(null);
    setEventHeroImageLoading(false);
    /* eslint-enable react-hooks/set-state-in-effect */

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

  const severityVariant =
    point.severity === "critical"
      ? "critical"
      : point.severity === "high"
        ? "high"
        : point.severity === "medium"
          ? "medium"
          : "low";

  const [tab, setTab] = useState<IntelBriefTabId>("overview");
  const signalRows = metadataEntries.filter(([k]) => !hiddenMetadataKeys.has(k));

  const pointTabs = useMemo(() => {
    const t: { id: IntelBriefTabId; label: string }[] = [
      { id: "overview", label: "Overview" },
      { id: "signals", label: "Signals" },
      { id: "sources", label: "Sources" },
      { id: "summary", label: "Summary" },
    ];
    return t;
  }, []);

  const layerKicker =
    point.layer === "carriers"
      ? "Carriers (preview)"
      : INTEL_LAYER_LABELS[point.layer] ?? point.layer;

  return (
    <aside className="intel-side-panel intel-brief-panel intel-panel-responsive">
      <div className="intel-brief-sticky">
        <button type="button" className="intel-side-close intel-brief-close" aria-label="Close brief" onClick={onClose}>
          ×
        </button>
        <div className="intel-brief-title-block">
          <div className="intel-side-kicker">{layerKicker}</div>
          <h3 className="intel-brief-title">{point.title}</h3>
          <p className="intel-brief-subtitle">{point.subtitle || point.country || "Global signal"}</p>
        </div>
        <IntelBriefTabs tabs={pointTabs} active={tab} onChange={setTab} />
      </div>

      <div className="intel-brief-scroll">
        <IntelBriefTabPanel id="overview" active={tab}>
          <div className="intel-brief-section">
            {(articleImageLoading || eventHeroImageLoading) && !fromPointImage ? (
              <div className="intel-side-image intel-side-image-loading intel-brief-hero-skel" aria-hidden />
            ) : null}
            {imageUrl ? (
              <img src={imageUrl} alt={point.title} className="intel-side-image intel-brief-hero" />
            ) : !articleImageLoading && !eventHeroImageLoading ? (
              <img src={heroPlaceholderForPoint(point)} alt="" className="intel-side-image intel-brief-hero" />
            ) : null}
            <div className="intel-brief-chips">
              <StatusChip variant={severityVariant}>{point.severity}</StatusChip>
              {typeof point.confidence === "number" ? (
                <StatusChip variant="medium">{`${Math.round(point.confidence * 100)}% confidence`}</StatusChip>
              ) : null}
            </div>
            <div className="intel-side-grid intel-brief-pad">
              <div className="intel-side-item">
                <span>Country</span>
                <strong>{displayCountry ?? "Unknown"}</strong>
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
                <span>Source</span>
                <strong>{point.source}</strong>
              </div>
              <div className="intel-side-item">
                <span>Updated</span>
                <strong>{new Date(point.timestamp).toLocaleString()}</strong>
              </div>
            </div>
            {sourceUrl ? (
              <a href={sourceUrl} className="intel-brief-link" target="_blank" rel="noreferrer">
                Open primary article
              </a>
            ) : null}
          </div>
        </IntelBriefTabPanel>

        <IntelBriefTabPanel id="signals" active={tab}>
          <div className="intel-brief-pad">
            {signalRows.length > 0 ? (
              signalRows.map(([k, v]) => (
                <div key={k} className="intel-side-item">
                  <span>{formatMetadataLabel(k)}</span>
                  <strong>{String(v)}</strong>
                </div>
              ))
            ) : (
              <p className="intel-brief-muted">No extra signal fields for this point.</p>
            )}
          </div>
        </IntelBriefTabPanel>

        <IntelBriefTabPanel id="sources" active={tab}>
          <div className="intel-brief-pad">
            <div className="intel-side-subtitle">Feed line match</div>
            <div className="intel-side-item">
              <span>This event</span>
              <strong>{point.source}</strong>
            </div>
            {health?.message ? <p className="intel-side-note">{health.message}</p> : null}
            <div className="intel-side-subtitle intel-brief-mt">Pipeline status</div>
            {providerHealth.map((h) => (
              <div key={h.provider} className="intel-side-item">
                <span>{h.provider}</span>
                <strong style={{ color: h.ok ? "#34d399" : "#f87171" }}>{h.ok ? "OK" : "Degraded"}</strong>
              </div>
            ))}
          </div>
        </IntelBriefTabPanel>

        <IntelBriefTabPanel id="summary" active={tab}>
          <div className="intel-brief-pad">
            {aiLoading ? (
              <div className="map-skeleton map-skeleton-text" />
            ) : aiBulletLines.length > 0 ? (
              <ul className="intel-side-note-list">
                {aiBulletLines.map((line, idx) => (
                  <li key={`${point.id}-ai-${idx}`}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="intel-brief-muted">No AI summary yet.</p>
            )}
          </div>
        </IntelBriefTabPanel>
      </div>
    </aside>
  );
}
