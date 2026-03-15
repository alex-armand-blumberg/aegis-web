"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { MapPoint } from "@/app/api/map/route";
import { CATEGORY_COLORS } from "./ConflictMap";
import type { GlobeMethods } from "react-globe.gl";

const Globe = dynamic(() => import("react-globe.gl"), { ssr: false });

type GlobePoint = {
  lat: number;
  lng: number;
  color: string;
  country: string;
  size: number;
};

const DEFAULT_POV = { lat: 20, lng: 10, altitude: 2.2 };

type ConflictGlobeProps = {
  points: MapPoint[];
  containerRef?: React.RefObject<HTMLDivElement | null>;
  recenterRef?: React.MutableRefObject<(() => void) | null>;
  onReady?: () => void;
  onError?: (message: string) => void;
  onCountrySelect?: (country: string) => void;
};

function totalEvents(p: MapPoint): number {
  return (
    (p.battles ?? 0) +
    (p.explosions_remote_violence ?? 0) +
    (p.violence_against_civilians ?? 0) +
    (p.strategic_developments ?? 0) +
    (p.protests ?? 0) +
    (p.riots ?? 0)
  );
}

export default function ConflictGlobe({
  points,
  containerRef,
  recenterRef,
  onReady,
  onError,
  onCountrySelect,
}: ConflictGlobeProps) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const globePoints = useMemo<GlobePoint[]>(() => {
    const maxEvents = Math.max(1, ...points.map(totalEvents));
    return points
      .filter((p) => Math.abs(p.lat) >= 0.5 || Math.abs(p.lon) >= 0.5)
      .map((p) => ({
        lat: p.lat,
        lng: p.lon,
        color: CATEGORY_COLORS[p.dominant_category] ?? "rgba(255,255,255,0.6)",
        country: (p.country ?? "").trim() || "Unknown",
        size: 0.15 + 0.25 * (totalEvents(p) / maxEvents),
      }));
  }, [points]);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useEffect(() => {
    if (!containerRef?.current) return;
    const el = containerRef.current;
    const updateSize = () => {
      if (el) {
        setDimensions({ width: el.clientWidth, height: el.clientHeight });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  useEffect(() => {
    if (!recenterRef) return;
    recenterRef.current = () => {
      globeRef.current?.pointOfView(DEFAULT_POV, 1000);
    };
    return () => {
      recenterRef.current = null;
    };
  }, [recenterRef]);

  const handlePointClick = useCallback(
    (point: GlobePoint) => {
      onCountrySelect?.(point.country);
    },
    [onCountrySelect]
  );

  const handleGlobeReady = useCallback(() => {
    onReady?.();
  }, [onReady]);

  const mapStyle = {
    position: "absolute" as const,
    inset: 0,
    width: "100%",
    height: "100%",
    zIndex: 1,
    minHeight: 400,
  };

  return (
    <div style={mapStyle}>
      <Globe
        ref={globeRef as React.MutableRefObject<GlobeMethods | undefined>}
        globeImageUrl={undefined}
        bumpImageUrl={undefined}
        backgroundImageUrl={undefined}
        backgroundColor="#020617"
        showGlobe={true}
        showAtmosphere={true}
        atmosphereColor="#1a4aaa"
        atmosphereAltitude={0.08}
        pointsData={globePoints}
        pointLat="lat"
        pointLng="lng"
        pointColor="color"
        pointAltitude={0.014}
        pointRadius="size"
        pointsMerge={false}
        onPointClick={(p, _event, _coords) =>
          handlePointClick(p as GlobePoint)
        }
        onGlobeReady={handleGlobeReady}
        width={dimensions.width}
        height={dimensions.height}
      />
    </div>
  );
}
