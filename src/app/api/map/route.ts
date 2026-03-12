import { NextResponse } from "next/server";

const ACLED_ARCGIS_QUERY_URL =
  "https://services8.arcgis.com/xu983xJB6fIDCjpX/arcgis/rest/services/ACLED/FeatureServer/0/query";

export type MapPoint = {
  lat: number;
  lon: number;
  country: string;
  event_month: string;
  total_events: number;
};

export async function GET() {
  try {
    const params = new URLSearchParams({
      where: "1=1",
      outFields:
        "country,event_month,battles,explosions_remote_violence,protests,riots,strategic_developments,violence_against_civilians,centroid_longitude,centroid_latitude",
      returnGeometry: "false",
      orderByFields: "ObjectId DESC",
      resultRecordCount: "2000",
      f: "json",
    });

    const res = await fetch(`${ACLED_ARCGIS_QUERY_URL}?${params.toString()}`, {
      headers: { "User-Agent": "AEGIS-map" },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `ACLED ArcGIS error ${res.status}: ${text}` },
        { status: 500 },
      );
    }

    const json = (await res.json()) as {
      features?: {
        attributes: {
          country: string;
          event_month: number;
          battles: number;
          explosions_remote_violence: number;
          protests: number;
          riots: number;
          strategic_developments: number;
          violence_against_civilians: number;
          centroid_longitude: number;
          centroid_latitude: number;
        };
      }[];
    };

    const points: MapPoint[] = [];
    for (const f of json.features ?? []) {
      const a = f.attributes;
      const total =
        (a.battles ?? 0) +
        (a.explosions_remote_violence ?? 0) +
        (a.protests ?? 0) +
        (a.riots ?? 0) +
        (a.strategic_developments ?? 0) +
        (a.violence_against_civilians ?? 0);
      points.push({
        country: a.country,
        event_month: new Date(a.event_month).toISOString(),
        lat: a.centroid_latitude,
        lon: a.centroid_longitude,
        total_events: total,
      });
    }

    return NextResponse.json({ points }, { status: 200 });
  } catch (err) {
    console.error("Map API error", err);
    return NextResponse.json(
      { error: "Failed to load conflict hotspots." },
      { status: 500 },
    );
  }
}

