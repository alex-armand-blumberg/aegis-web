import { normalizeCountryKey } from "@/lib/countryDisplay";

const NATURAL_EARTH_COUNTRIES_GEOJSON_URL =
  "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json";

type LatLon = { lat: number; lon: number };

let centersPromise:
  | Promise<Map<string, LatLon>>
  | null = null;

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function updateBoundsFromCoord(
  lon: unknown,
  lat: unknown,
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number }
) {
  if (!isNumber(lat) || !isNumber(lon)) return;
  bounds.minLat = Math.min(bounds.minLat, lat);
  bounds.maxLat = Math.max(bounds.maxLat, lat);
  bounds.minLon = Math.min(bounds.minLon, lon);
  bounds.maxLon = Math.max(bounds.maxLon, lon);
}

function computeBoundsFromGeometry(geometry: unknown): {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
} | null {
  if (!geometry || typeof geometry !== "object") return null;
  const { type, coordinates } = geometry as { type?: string; coordinates?: unknown };
  if (!type || !coordinates) return null;

  const bounds = {
    minLat: 90,
    maxLat: -90,
    minLon: 180,
    maxLon: -180,
  };

  // Natural Earth uses GeoJSON coordinates: [lon, lat]
  const walk = (c: unknown) => {
    if (!Array.isArray(c)) return;
    if (c.length >= 2 && isNumber(c[0]) && isNumber(c[1])) {
      const [lon, lat] = c;
      updateBoundsFromCoord(lon, lat, bounds);
      return;
    }
    for (const inner of c) walk(inner);
  };

  if (type === "Polygon" || type === "MultiPolygon") {
    walk(coordinates);
  } else {
    // Other types not expected for country polygons; skip.
    return null;
  }

  if (bounds.minLat > bounds.maxLat || bounds.minLon > bounds.maxLon) return null;
  return bounds;
}

async function loadNaturalEarthCountryCenters(): Promise<Map<string, LatLon>> {
  if (centersPromise) return centersPromise;

  centersPromise = (async () => {
    try {
      const res = await fetch(NATURAL_EARTH_COUNTRIES_GEOJSON_URL, {
        headers: { "user-agent": "AEGIS-NaturalEarthCenters/1.0" },
      });
      if (!res.ok) return new Map<string, LatLon>();
      const json = (await res.json()) as {
        features?: Array<{ properties?: { name?: string }; geometry?: unknown }>;
      };
      const centers = new Map<string, LatLon>();

      for (const f of json.features ?? []) {
        const name = String(f?.properties?.name ?? "").trim();
        if (!name) continue;

        const bounds = computeBoundsFromGeometry(f?.geometry);
        if (!bounds) continue;

        const center: LatLon = {
          lat: (bounds.minLat + bounds.maxLat) / 2,
          lon: (bounds.minLon + bounds.maxLon) / 2,
        };

        centers.set(normalizeCountryKey(name), center);
      }

      return centers;
    } catch {
      return new Map<string, LatLon>();
    }
  })();

  return centersPromise;
}

export async function getNaturalEarthCountryCenter(
  country: string
): Promise<LatLon | null> {
  const centers = await loadNaturalEarthCountryCenters();
  const key = normalizeCountryKey(country);
  return centers.get(key) ?? null;
}

export async function getNaturalEarthCountryCentersMap(): Promise<
  Map<string, LatLon>
> {
  return loadNaturalEarthCountryCenters();
}

