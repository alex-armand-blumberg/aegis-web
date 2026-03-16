import { NextResponse } from "next/server";

export async function GET() {
  const env = {
    openskyAuth: Boolean(
      process.env.OPENSKY_USERNAME?.trim() &&
        process.env.OPENSKY_PASSWORD?.trim()
    ),
    aisRelay: Boolean(process.env.AISSTREAM_SNAPSHOT_URL?.trim()),
    acledAuth: Boolean(
      process.env.ACLED_EMAIL?.trim() && process.env.ACLED_PASSWORD?.trim()
    ),
  };

  return NextResponse.json(
    {
      status: "ok",
      updatedAt: new Date().toISOString(),
      env,
      notes: [
        "OpenSky works without auth but auth improves limits/reliability.",
        "AIS layer requires AISSTREAM_SNAPSHOT_URL relay endpoint.",
      ],
    },
    { status: 200 }
  );
}
