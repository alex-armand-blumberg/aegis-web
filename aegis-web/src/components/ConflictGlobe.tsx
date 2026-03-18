"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { GlobeMethods } from "react-globe.gl";
import type { FrontlineOverlay, IntelLayerKey, IntelPoint } from "@/lib/intel/types";
import { LAYER_COLORS } from "@/lib/intel/colors";

const Globe = dynamic(() => import("react-globe.gl"), { ssr: false });

type GlobePoint = IntelPoint & {
  color: string;
  radius: number;
};

/** Path for globe: array of [lat, lng] (globe.gl convention). */
type PathPoint = [number, number];

function isGeoJsonFeature(value: unknown): value is { type: string; geometry?: { type: string; coordinates?: unknown } } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { type?: unknown; geometry?: unknown };
  return v.type === "Feature" && typeof v.geometry === "object" && v.geometry !== null;
}

function isGeoJsonFeatureCollection(value: unknown): value is { type: string; features?: unknown[] } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { type?: unknown; features?: unknown };
  return v.type === "FeatureCollection" && Array.isArray(v.features);
}

function extractFrontlinePaths(overlays: FrontlineOverlay[]): PathPoint[][] {
  const paths: PathPoint[][] = [];
  for (const o of overlays) {
    const g = o.geojson;
    const features: { type: string; geometry?: { type: string; coordinates?: unknown } }[] = [];
    if (isGeoJsonFeature(g)) features.push(g);
    else if (isGeoJsonFeatureCollection(g)) for (const f of g.features ?? []) if (isGeoJsonFeature(f)) features.push(f);
    for (const f of features) {
      const geom = f.geometry;
      if (!geom || !geom.coordinates) continue;
      const coords = geom.coordinates as unknown[];
      const toLatLng = (c: unknown): PathPoint => (Array.isArray(c) && c.length >= 2 ? [Number(c[1]), Number(c[0])] : [0, 0]);
      if (geom.type === "LineString" && Array.isArray(coords)) {
        paths.push(coords.map(toLatLng));
      } else if (geom.type === "MultiLineString" && Array.isArray(coords)) {
        for (const ring of coords) {
          if (Array.isArray(ring)) paths.push(ring.map(toLatLng));
        }
      }
    }
  }
  return paths;
}

type ConflictGlobeProps = {
  layers: Record<IntelLayerKey, IntelPoint[]>;
  activeLayers: Record<IntelLayerKey, boolean>;
  frontlineOverlays?: FrontlineOverlay[];
  recenterRef?: React.MutableRefObject<(() => void) | null>;
  onReady?: () => void;
  onError?: (message: string) => void;
  onPointSelect?: (point: IntelPoint) => void;
  autoRotate?: boolean;
};

const DEFAULT_POV = { lat: 20, lng: 10, altitude: 2.05 };

function asRgbCss([r, g, b]: [number, number, number], alpha = 0.95): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function ConflictGlobe({
  layers,
  activeLayers,
  frontlineOverlays = [],
  recenterRef,
  onReady,
  onError,
  onPointSelect,
  autoRotate = false,
}: ConflictGlobeProps) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState({ width: 1000, height: 700 });

  useEffect(() => {
    const updateSize = () => {
      setSize({
        width: Math.max(400, window.innerWidth - 120),
        height: Math.max(380, window.innerHeight - 220),
      });
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    if (!recenterRef) return;
    recenterRef.current = () => globeRef.current?.pointOfView(DEFAULT_POV, 900);
    return () => {
      recenterRef.current = null;
    };
  }, [recenterRef]);

  const pathsData = useMemo(() => {
    const pathArrays = extractFrontlinePaths(frontlineOverlays);
    return pathArrays.map((points) => ({ points }));
  }, [frontlineOverlays]);

  const pointsData = useMemo<GlobePoint[]>(() => {
    const out: GlobePoint[] = [];
    for (const key of Object.keys(activeLayers) as IntelLayerKey[]) {
      if (!activeLayers[key]) continue;
      const color = asRgbCss(LAYER_COLORS[key]);
      for (const p of layers[key]) {
        const scaled = Math.max(0.08, Math.min(0.36, (p.magnitude ?? 1) / 80));
        out.push({
          ...p,
          color,
          radius: key === "hotspots" ? scaled * 1.35 : scaled,
        });
      }
    }
    return out;
  }, [activeLayers, layers]);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useEffect(() => {
    const controls = globeRef.current?.controls?.();
    if (!controls) return;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.45;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
  }, [autoRotate]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Globe
        ref={globeRef as React.MutableRefObject<GlobeMethods | undefined>}
        width={size.width}
        height={size.height}
        globeImageUrl="https://unpkg.com/three-globe/example/img/earth-dark.jpg"
        bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundImageUrl="https://unpkg.com/three-globe/example/img/night-sky.png"
        backgroundColor="#020617"
        showAtmosphere={true}
        atmosphereColor="#4b7fd1"
        atmosphereAltitude={0.11}
        pathsData={pathsData}
        pathPoints={(d) => (d as { points: PathPoint[] }).points}
        pathPointLat={(p) => (p as PathPoint)[0]}
        pathPointLng={(p) => (p as PathPoint)[1]}
        pathColor={() => "rgba(253, 186, 116, 0.85)"}
        pathStroke={1.2}
        pointsData={pointsData}
        pointLat="lat"
        pointLng="lon"
        pointColor="color"
        pointRadius="radius"
        pointAltitude={0.008}
        pointLabel={(p) => {
          const d = p as GlobePoint;
          return `<div style='background:rgba(2,8,20,0.92);padding:8px 10px;border:1px solid rgba(96,165,250,0.35);border-radius:6px;'>
            <div style='font-weight:700;color:white;font-size:12px;'>${d.title}</div>
            <div style='color:rgba(255,255,255,0.7);font-size:11px;margin-top:2px;'>${d.layer.toUpperCase()} · ${d.source}</div>
          </div>`;
        }}
        onPointClick={(obj) => onPointSelect?.(obj as IntelPoint)}
        onGlobeReady={() => {
          globeRef.current?.pointOfView(DEFAULT_POV, 0);
          onReady?.();
        }}
        onZoom={() => {
          const controls = globeRef.current?.controls?.();
          if (controls) {
            controls.maxDistance = 430;
            controls.minDistance = 90;
          }
        }}
      />
      {pointsData.length === 0 && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 80,
            transform: "translateX(-50%)",
            zIndex: 20,
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid rgba(96,165,250,0.3)",
            background: "rgba(2,8,20,0.8)",
            color: "rgba(226,232,240,0.85)",
            fontSize: 12,
            letterSpacing: "0.04em",
          }}
        >
          No active points for selected layers and time range.
        </div>
      )}
    </div>
  );
}
