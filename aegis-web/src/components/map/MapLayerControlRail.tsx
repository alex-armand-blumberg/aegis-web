"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IntelLayerKey } from "@/lib/intel/types";
import { layerColorCss } from "@/lib/intel/colors";
import {
  LAYER_CATEGORIES,
  LAYER_PRESETS,
  LAYER_TOOLTIPS,
  MAP_LAYER_STORAGE_KEY,
  TOGGLEABLE_LAYERS,
  allLayersOff,
  allLayersOn,
  mergePreset,
  type LayerPresetId,
} from "./mapLayerPresets";

export type LayerLabelFn = (key: IntelLayerKey) => string;

type MapLayerControlRailProps = {
  activeLayers: Record<IntelLayerKey, boolean>;
  counts: Record<IntelLayerKey, number>;
  onChange: (next: Record<IntelLayerKey, boolean>) => void;
  layerLabel: LayerLabelFn;
  className?: string;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
};

export function MapLayerControlRail({
  activeLayers,
  counts,
  onChange,
  layerLabel,
  className = "",
  mobileOpen,
  onMobileOpenChange,
}: MapLayerControlRailProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [presetHint, setPresetHint] = useState<string | null>(null);
  const hydrated = useRef(false);

  const persist = useCallback((next: Record<IntelLayerKey, boolean>) => {
    try {
      const slice: Record<string, boolean> = {};
      for (const k of TOGGLEABLE_LAYERS) slice[k] = next[k];
      localStorage.setItem(MAP_LAYER_STORAGE_KEY, JSON.stringify({ layers: slice }));
    } catch {
      /* ignore */
    }
  }, []);

  const commit = useCallback(
    (next: Record<IntelLayerKey, boolean>) => {
      onChange(next);
      persist(next);
    },
    [onChange, persist]
  );

  const toggleLayer = useCallback(
    (key: IntelLayerKey) => {
      commit({ ...activeLayers, [key]: !activeLayers[key] });
    },
    [activeLayers, commit]
  );

  const applyPreset = useCallback(
    (id: LayerPresetId) => {
      const preset = LAYER_PRESETS.find((p) => p.id === id);
      if (!preset) return;
      const merged = mergePreset(preset, allLayersOff());
      commit({ ...activeLayers, ...merged });
      setPresetHint(preset.label);
      window.setTimeout(() => setPresetHint(null), 2000);
    },
    [activeLayers, commit]
  );

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      const raw = localStorage.getItem(MAP_LAYER_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { layers?: Record<string, boolean> };
      if (!parsed.layers || typeof parsed.layers !== "object") return;
      const next = { ...activeLayers };
      let changed = false;
      for (const k of TOGGLEABLE_LAYERS) {
        if (typeof parsed.layers[k] === "boolean" && parsed.layers[k] !== next[k]) {
          next[k] = parsed.layers[k];
          changed = true;
        }
      }
      if (changed) onChange(next);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time hydrate
  }, []);

  const body = (
    <>
      <div className="map-layer-rail-toolbar">
        <button
          type="button"
          className="map-layer-rail-btn"
          onClick={() => commit({ ...activeLayers, ...allLayersOn() })}
        >
          All on
        </button>
        <button
          type="button"
          className="map-layer-rail-btn"
          onClick={() => commit({ ...activeLayers, ...allLayersOff() })}
        >
          Clear
        </button>
        <button
          type="button"
          className="map-layer-rail-collapse map-layer-rail-collapse-desktop"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? "Expand" : "Collapse"}
        </button>
      </div>
      <div className="map-layer-rail-presets">
        {LAYER_PRESETS.map((p) => (
          <button key={p.id} type="button" className="map-layer-preset-chip" onClick={() => applyPreset(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      {presetHint ? <div className="map-layer-rail-toast">Applied: {presetHint}</div> : null}
      {!collapsed ? (
        <div className="map-layer-rail-categories">
          {LAYER_CATEGORIES.map((cat) => (
            <div key={cat.id} className="map-layer-cat">
              <div className="map-layer-cat-label">{cat.label}</div>
              <div className="map-layer-cat-chips">
                {cat.layers.map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="switch"
                    aria-checked={activeLayers[key]}
                    title={LAYER_TOOLTIPS[key]}
                    className={`map-layer-toggle-chip ${activeLayers[key] ? "map-layer-toggle-chip-on" : ""}`}
                    onClick={() => toggleLayer(key)}
                  >
                    <span className="map-layer-toggle-dot" style={{ background: layerColorCss(key) }} />
                    <span className="map-layer-toggle-label">{layerLabel(key)}</span>
                    <span className="map-layer-toggle-count">{counts[key] ?? 0}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );

  return (
    <>
      <button
        type="button"
        className="map-layer-fab"
        aria-label="Open layer controls"
        onClick={() => onMobileOpenChange(true)}
      >
        Layers
      </button>
      {mobileOpen ? (
        <div
          className="map-layer-sheet-backdrop"
          role="presentation"
          onClick={() => onMobileOpenChange(false)}
        />
      ) : null}
      <aside
        className={`map-layer-rail ${mobileOpen ? "map-layer-rail-mobile-open" : ""} ${className}`.trim()}
      >
        <div className="map-layer-rail-head">
          <span className="map-layer-rail-title">Layers</span>
          <button
            type="button"
            className="map-layer-rail-close-mobile"
            aria-label="Close layers"
            onClick={() => onMobileOpenChange(false)}
          >
            ×
          </button>
        </div>
        {body}
      </aside>
    </>
  );
}
