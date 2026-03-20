export type RegionPolygonFeature = {
  type: "Feature";
  properties: { regionKey: string; name: string };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: RegionPolygonFeature[];
};

const REGION_GEOJSON: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { regionKey: "indian-ocean", name: "Indian Ocean" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [20.0, -60.0],
            [147.0, -60.0],
            [147.0, 30.0],
            [95.0, 30.0],
            [77.0, 25.0],
            [55.0, 24.0],
            [43.0, 13.0],
            [32.0, 8.0],
            [20.0, -10.0],
            [20.0, -60.0],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { regionKey: "south-china-sea", name: "South China Sea" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [99.0, 0.5],
            [121.5, 0.5],
            [121.5, 23.5],
            [117.0, 24.5],
            [111.5, 23.8],
            [108.0, 22.8],
            [105.0, 19.0],
            [102.0, 12.0],
            [99.0, 0.5],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { regionKey: "strait-of-hormuz", name: "Strait of Hormuz" },
      geometry: {
        type: "Polygon",
        coordinates: [[[55.0, 25.0], [57.7, 25.0], [57.7, 27.2], [55.0, 27.2], [55.0, 25.0]]],
      },
    },
    {
      type: "Feature",
      properties: { regionKey: "atlantic-ocean", name: "Atlantic Ocean" },
      geometry: {
        type: "Polygon",
        coordinates: [[[-100.0, -60.0], [20.0, -60.0], [20.0, 75.0], [-100.0, 75.0], [-100.0, -60.0]]],
      },
    },
    {
      type: "Feature",
      properties: { regionKey: "arctic-ocean", name: "Arctic Ocean" },
      geometry: {
        type: "Polygon",
        coordinates: [[[-180.0, 66.0], [180.0, 66.0], [180.0, 90.0], [-180.0, 90.0], [-180.0, 66.0]]],
      },
    },
    {
      type: "Feature",
      properties: { regionKey: "antarctica", name: "Antarctica" },
      geometry: {
        type: "Polygon",
        coordinates: [[[-180.0, -90.0], [180.0, -90.0], [180.0, -60.0], [-180.0, -60.0], [-180.0, -90.0]]],
      },
    },
  ],
};

export function getOceanRegionFeatures(): RegionPolygonFeature[] {
  return REGION_GEOJSON.features;
}

export function getOceanRegionByKey(key: string): RegionPolygonFeature | null {
  const normalized = key.trim().toLowerCase();
  return (
    REGION_GEOJSON.features.find(
      (f) => f.properties.regionKey.trim().toLowerCase() === normalized
    ) ?? null
  );
}

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lon: number, lat: number, polygon: number[][][]): boolean {
  if (polygon.length === 0) return false;
  if (!pointInRing(lon, lat, polygon[0])) return false;
  // Hole rings: if inside any hole => outside polygon.
  for (let i = 1; i < polygon.length; i += 1) {
    if (pointInRing(lon, lat, polygon[i])) return false;
  }
  return true;
}

export function pointInRegion(
  lon: number,
  lat: number,
  feature: RegionPolygonFeature
): boolean {
  if (feature.geometry.type === "Polygon") {
    return pointInPolygon(lon, lat, feature.geometry.coordinates as number[][][]);
  }
  const polys = feature.geometry.coordinates as number[][][][];
  return polys.some((poly) => pointInPolygon(lon, lat, poly));
}

export function resolveOceanRegionAt(
  lon: number,
  lat: number
): { key: string; name: string } | null {
  for (const feature of REGION_GEOJSON.features) {
    if (pointInRegion(lon, lat, feature)) {
      return {
        key: feature.properties.regionKey,
        name: feature.properties.name,
      };
    }
  }
  return null;
}
