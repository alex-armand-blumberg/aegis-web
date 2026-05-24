import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { runUcdpIngest } from "@/lib/impact/ucdpIngest";

export const maxDuration = 300;

/**
 * Authorization:
 * - Production (NODE_ENV === "production"): CRON_SECRET is required.
 *   A missing CRON_SECRET in production means the route is misconfigured — return 401.
 * - Development: if CRON_SECRET is not set, allow through for local testing.
 *
 * Vercel crons automatically inject "Authorization: Bearer ${CRON_SECRET}".
 * Manual triggers should use ?secret=<value> or the Authorization header.
 */
function isAuthorized(request: Request): { ok: boolean; reason?: string } {
  const secret = process.env.CRON_SECRET?.trim();
  const isProduction = process.env.NODE_ENV === "production";

  if (!secret) {
    if (isProduction) {
      return {
        ok: false,
        reason:
          "CRON_SECRET is not configured. This DB-writing route requires authentication in production.",
      };
    }
    // Dev: allow through without auth
    return { ok: true };
  }

  const authHeader = request.headers.get("authorization")?.trim() ?? "";
  if (authHeader === `Bearer ${secret}`) return { ok: true };

  const url = new URL(request.url);
  if (url.searchParams.get("secret") === secret) return { ok: true };

  return { ok: false, reason: "Invalid or missing authorization credentials." };
}

export async function GET(request: Request): Promise<Response> {
  const auth = isAuthorized(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: "Unauthorized", reason: auth.reason },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const source = (url.searchParams.get("source") ?? "").toLowerCase();

  if (source !== "ucdp") {
    return NextResponse.json(
      {
        error: "Unknown source",
        supported: ["ucdp"],
        usage: "/api/internal/impact/ingest?source=ucdp",
      },
      { status: 400 }
    );
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json(
      {
        status: "skipped",
        reason: "DATABASE_URL is not configured.",
        source: "ucdp",
      },
      { status: 200 }
    );
  }

  const result = await runUcdpIngest(db);

  return NextResponse.json(
    {
      source: "ucdp",
      status: result.status,
      rowsUpserted: result.rowsUpserted,
      rowsFailed: result.rowsFailed,
      version: result.version,
      message: result.message,
      ranAt: new Date().toISOString(),
    },
    { status: result.status === "error" ? 500 : 200 }
  );
}
