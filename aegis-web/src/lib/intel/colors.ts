import type { IntelLayerKey } from "./types";

export const LAYER_COLORS: Record<IntelLayerKey, [number, number, number]> = {
  conflicts: [239, 68, 68],
  liveStrikes: [251, 113, 133],
  flights: [245, 158, 11],
  vessels: [96, 165, 250],
  carriers: [248, 113, 113],
  news: [167, 139, 250],
  escalationRisk: [244, 114, 182],
  hotspots: [253, 224, 71],
  infrastructure: [45, 212, 191],
};

export function layerColorCss(layer: IntelLayerKey): string {
  const [r, g, b] = LAYER_COLORS[layer];
  return `rgb(${r}, ${g}, ${b})`;
}
