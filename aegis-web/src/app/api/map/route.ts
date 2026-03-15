import { NextResponse } from "next/server";

const ACLED_ARCGIS_QUERY_URL =
  "https://services8.arcgis.com/xu983xJB6fIDCjpX/arcgis/rest/services/ACLED/FeatureServer/0/query";

const ACLED_FIELDS =
  "country,admin1,event_month,battles,explosions_remote_violence,protests,riots,strategic_developments,violence_against_civilians,violent_actors,fatalities,centroid_longitude,centroid_latitude,ObjectId";

export type MapPointAttributes = {
  country: string;
  admin1: string | null;
  event_month: string;
  battles: number;
  explosions_remote_violence: number;
  protests: number;
  riots: number;
  strategic_developments: number;
  violence_against_civilians: number;
  violent_actors: number;
  fatalities: number;
  centroid_longitude: number;
  centroid_latitude: number;
  dominant_category: string;
};

export type MapPoint = MapPointAttributes & {
  lat: number;
  lon: number;
};

function getMonthBounds(ym: string): { startMs: number; endMs: number } {
  const [y, m] = ym.split("-").map(Number);
  const startMs = new Date(y, m - 1, 1).getTime();
  const endMs = new Date(y, m, 0, 23, 59, 59, 999).getTime();
  return { startMs, endMs };
}

/** Filter features by event_month (ArcGIS often rejects date in where clause, so we filter client-side). */
function filterByDateRange(
  features: { attributes: Record<string, unknown> }[],
  startMonth: string,
  endMonth: string
): { attributes: Record<string, unknown> }[] {
  if (!startMonth || !endMonth) return features;
  const { startMs, endMs } = getMonthBounds(startMonth);
  const endMsBound = getMonthBounds(endMonth).endMs;
  return features.filter((f) => {
    const raw = f.attributes.event_month;
    const ms =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? new Date(raw).getTime()
          : NaN;
    if (Number.isNaN(ms)) return false;
    return ms >= startMs && ms <= endMsBound;
  });
}

function dominantCategory(attrs: Record<string, unknown>): string {
  const categoryMap: Record<string, string> = {
    battles: "Battles",
    explosions_remote_violence: "Explosions / Remote Violence",
    violence_against_civilians: "Violence Against Civilians",
    strategic_developments: "Strategic Developments",
    protests: "Protests",
    riots: "Riots",
  };
  let maxVal = 0;
  let dominant = "Battles";
  for (const [key, label] of Object.entries(categoryMap)) {
    const v = Number(attrs[key]) || 0;
    if (v > maxVal) {
      maxVal = v;
      dominant = label;
    }
  }
  return dominant;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startMonth = searchParams.get("startMonth") ?? "";
    const endMonth = searchParams.get("endMonth") ?? "";

    const points: MapPoint[] = [];
    const pageSize = 2000;
    let offset = 0;

    while (true) {
      const params = new URLSearchParams({
        where: "1=1",
        outFields: ACLED_FIELDS,
        returnGeometry: "false",
        orderByFields: "ObjectId ASC",
        resultOffset: String(offset),
        resultRecordCount: String(pageSize),
        f: "json",
      });

      const res = await fetch(
        `${ACLED_ARCGIS_QUERY_URL}?${params.toString()}`,
        {
          headers: { "User-Agent": "AEGIS-map" },
          cache: "no-store",
        }
      );

      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json(
          { error: `ACLED ArcGIS error ${res.status}: ${text}` },
          { status: 500 }
        );
      }

      const json = (await res.json()) as {
        features?: { attributes: Record<string, unknown> }[];
        error?: { message?: string };
      };

      if (json.error) {
        return NextResponse.json(
          { error: json.error.message ?? "ACLED service error" },
          { status: 500 }
        );
      }

      const rawFeatures = json.features ?? [];
      const features = filterByDateRange(
        rawFeatures,
        startMonth || "1900-01",
        endMonth || "2100-12"
      );

      for (const f of features) {
        const a = f.attributes;
        const lat = Number(a.centroid_latitude);
        const lon = Number(a.centroid_longitude);
        if (
          Number.isNaN(lat) ||
          Number.isNaN(lon) ||
          lat < -90 ||
          lat > 90 ||
          lon < -180 ||
          lon > 180
        )
          continue;

        const eventMonth =
          typeof a.event_month === "number"
            ? new Date(a.event_month).toISOString().slice(0, 7)
            : String(a.event_month ?? "").slice(0, 7);

        points.push({
          country: String(a.country ?? ""),
          admin1: a.admin1 != null ? String(a.admin1) : null,
          event_month: eventMonth,
          battles: Number(a.battles) || 0,
          explosions_remote_violence:
            Number(a.explosions_remote_violence) || 0,
          protests: Number(a.protests) || 0,
          riots: Number(a.riots) || 0,
          strategic_developments: Number(a.strategic_developments) || 0,
          violence_against_civilians: Number(a.violence_against_civilians) || 0,
          violent_actors: Number(a.violent_actors) || 0,
          fatalities: Number(a.fatalities) || 0,
          centroid_longitude: lon,
          centroid_latitude: lat,
          dominant_category: dominantCategory(a),
          lat,
          lon,
        });
      }

      if (rawFeatures.length < pageSize) break;
      offset += pageSize;
      if (offset > 50000) break;
    }

    return NextResponse.json({ points }, { status: 200 });
  } catch (err) {
    console.error("Map API error", err);
    return NextResponse.json(
      { error: "Failed to load conflict hotspots." },
      { status: 500 }
    );
  }
}
