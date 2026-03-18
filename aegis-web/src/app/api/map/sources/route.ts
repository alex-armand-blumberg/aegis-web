import { NextResponse } from "next/server";
import {
  MAP_SOURCE_FAMILY_MATRIX,
  WORLDMONITOR_RSS_NETWORK,
} from "@/lib/intel/sourceRegistry";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      updatedAt: new Date().toISOString(),
      families: MAP_SOURCE_FAMILY_MATRIX,
      rssNetwork: WORLDMONITOR_RSS_NETWORK,
      notes: [
        "This endpoint exposes the map-source parity inventory for conflicts/news/military/infrastructure layers.",
        "RSS sources include direct feeds and site-domain adapters (queried through Google News RSS site filters).",
      ],
    },
    { status: 200 }
  );
}

