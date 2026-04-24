import { NextResponse } from "next/server";
import { getTieredCacheRuntimeStatus } from "@/lib/cache/tieredCache";

export async function GET() {
  const cacheRuntime = getTieredCacheRuntimeStatus();
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
    newsApi: Boolean(process.env.NEWS_API?.trim()),
    relayDigest: Boolean(process.env.INTEL_RELAY_DIGEST_URL?.trim()),
    redisRest:
      Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim()) &&
      Boolean(process.env.UPSTASH_REDIS_REST_TOKEN?.trim()),
    redisRequiredInProduction: cacheRuntime.strictMode,
    redisReadyForProduction:
      !cacheRuntime.productionMode || (cacheRuntime.productionMode && cacheRuntime.redisConfigured),
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
        "Event Registry feed is enabled when NEWS_API is set.",
        "Relay-seeded feed ingestion is enabled when INTEL_RELAY_DIGEST_URL is set.",
        "Redis tiered cache is enabled when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set.",
        cacheRuntime.strictMode
          ? "Shared Redis cache is required in production mode for instant-load cache guarantees."
          : "Shared Redis cache requirement in production is disabled by REQUIRE_SHARED_CACHE_IN_PRODUCTION=false.",
        "Source inventory and family mapping are exposed at /api/map/sources.",
      ],
    },
    { status: 200 }
  );
}
