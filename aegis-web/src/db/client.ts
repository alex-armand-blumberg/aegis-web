import { neon } from "@neondatabase/serverless";

export type DbClient = ReturnType<typeof neon>;

/**
 * Returns a Neon SQL client, or null when DATABASE_URL is not configured.
 * All callers must guard against null before using the client.
 */
export function getDb(): DbClient | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  return neon(url);
}

/** True only when DATABASE_URL is set in the environment. */
export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}
