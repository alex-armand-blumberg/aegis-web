import type { IntelLayerKey } from "./types";

export const LAYER_COLORS: Record<IntelLayerKey, [number, number, number]> = {
  conflicts: [239, 68, 68],
  flights: [245, 158, 11],
  vessels: [96, 165, 250],
  news: [167, 139, 250],
  hotspots: [253, 224, 71],
};

export function layerColorCss(layer: IntelLayerKey): string {
  const [r, g, b] = LAYER_COLORS[layer];
  return `rgb(${r}, ${g}, ${b})`;
}
