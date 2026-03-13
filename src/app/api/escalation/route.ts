import { NextRequest, NextResponse } from "next/server";
import {
  AcledMonthlyRecord,
  computeEscalationIndex,
} from "@/lib/escalation";

const ACLED_ARCGIS_QUERY_URL =
  "https://services8.arcgis.com/xu983xJB6fIDCjpX/arcgis/rest/services/ACLED/FeatureServer/0/query";

const ACLED_FIELDS = [
  "country",
  "admin1",
  "event_month",
  "battles",
  "explosions_remote_violence",
  "protests",
  "riots",
  "strategic_developments",
  "violence_against_civilians",
  "violent_actors",
  "fatalities",
  "centroid_longitude",
  "centroid_latitude",
  "ObjectId",
] as const;

type AcledArcgisFeature = {
  attributes: {
    country: string;
    event_month: number; // ArcGIS epoch (ms)
    battles: number;
    explosions_remote_violence: number;
    protests: number;
    riots: number;
    strategic_developments: number;
    violence_against_civilians: number;
    violent_actors: number;
    fatalities: number;
  };
};

async function fetchAcledMonthlyAllCountries(): Promise<AcledMonthlyRecord[]> {
  const pageSize = 1000;
  let offset = 0;
  const rows: AcledMonthlyRecord[] = [];

  // Basic pagination loop mirroring the original Python implementation.
  // Stops when the server indicates the transfer limit is no longer exceeded
  // or when no more features are returned.
  // Note: this is network and data intensive; consider adding caching in production.
  while (true) {
    const params = new URLSearchParams({
      where: "1=1",
      outFields: ACLED_FIELDS.join(","),
      returnGeometry: "false",
      orderByFields: "ObjectId ASC",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      f: "json",
    });

    const res = await fetch(`${ACLED_ARCGIS_QUERY_URL}?${params.toString()}`, {
      headers: {
        "User-Agent": "AEGIS-escalation-index",
      },
      // Give the ArcGIS endpoint a sensible timeout.
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(
        `ACLED ArcGIS error ${res.status}: ${await res.text()}`,
      );
    }

    const data = (await res.json()) as {
      features?: AcledArcgisFeature[];
      exceededTransferLimit?: boolean;
    };

    const features = data.features ?? [];
    if (!features.length) break;

    for (const f of features) {
      const a = f.attributes;
      if (!a.country || !a.event_month) continue;
      rows.push({
        country: a.country,
        event_month: new Date(a.event_month),
        battles: a.battles ?? 0,
        explosions_remote_violence: a.explosions_remote_violence ?? 0,
        protests: a.protests ?? 0,
        riots: a.riots ?? 0,
        strategic_developments: a.strategic_developments ?? 0,
        violence_against_civilians: a.violence_against_civilians ?? 0,
        violent_actors: a.violent_actors ?? 0,
        fatalities: a.fatalities ?? 0,
      });
    }

    if (!data.exceededTransferLimit) {
      break;
    }

    offset += pageSize;
  }

  return rows;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const country = searchParams.get("country");
  const smoothParam = searchParams.get("smooth");
  const thresholdParam = searchParams.get("threshold");

  if (!country) {
    return NextResponse.json(
      { error: "Missing 'country' query parameter." },
      { status: 400 },
    );
  }

  const smoothWindow = smoothParam ? Number(smoothParam) || 3 : 3;
  const threshold = thresholdParam
    ? Math.max(0, Math.min(100, Number(thresholdParam) || 45))
    : 45;

  try {
    const allRows = await fetchAcledMonthlyAllCountries();
    const result = computeEscalationIndex(allRows, country, smoothWindow);

    if (!result.series.length) {
      return NextResponse.json(
        { error: `No data available for country '${country}'.` },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        ...result,
        escalationThreshold: threshold,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("Escalation API error", err);
    return NextResponse.json(
      {
        error:
          "Failed to compute escalation index. The ACLED ArcGIS service may be unavailable or slow.",
      },
      { status: 500 },
    );
  }
}

