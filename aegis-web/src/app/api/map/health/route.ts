import { NextResponse } from "next/server";

export async function GET() {
  const openskyBasic = Boolean(
    process.env.OPENSKY_USERNAME?.trim() && process.env.OPENSKY_PASSWORD?.trim()
  );
  const openskyOAuth = Boolean(
    process.env.OPENSKY_CLIENT_ID?.trim() && process.env.OPENSKY_CLIENT_SECRET?.trim()
  );
  const env = {
    openskyAuth: openskyBasic || openskyOAuth,
    openskyBasic,
    openskyOAuth,
    aisRelay: Boolean(process.env.AISSTREAM_SNAPSHOT_URL?.trim()),
    acledAuth: Boolean(
      process.env.ACLED_EMAIL?.trim() && process.env.ACLED_PASSWORD?.trim()
    ),
    ucdpToken: Boolean(process.env.UCDP_ACCESS_TOKEN?.trim()),
  };

  return NextResponse.json(
    {
      status: "ok",
      updatedAt: new Date().toISOString(),
      env,
      notes: [
        "OpenSky cloud reliability is best with OAuth credentials (OPENSKY_CLIENT_ID/OPENSKY_CLIENT_SECRET).",
        "Basic OpenSky auth still works in some environments but can be blocked/rate-limited on cloud IP ranges.",
        "AIS layer requires AISSTREAM_SNAPSHOT_URL relay endpoint.",
        "UCDP adds fresher event-level conflict signals when UCDP_ACCESS_TOKEN is set.",
      ],
    },
    { status: 200 }
  );
}
