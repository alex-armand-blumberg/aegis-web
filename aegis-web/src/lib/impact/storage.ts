import type { AlertFeedback, UserAsset } from "./types";

export const ASSETS_KEY = "aegis-impact-assets-v1";
export const FEEDBACK_KEY = "aegis-impact-feedback-v1";

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeParse<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

const VALID_ASSET_TYPES = new Set([
  "supplier",
  "facility",
  "port",
  "route",
  "office",
  "school_program",
  "personnel",
  "field_site",
  "infrastructure",
  "region",
  "other",
]);

const VALID_IMPORTANCE = new Set(["low", "medium", "high", "critical"]);
const VALID_FEEDBACK_VALUES = new Set([
  "useful",
  "not_useful",
  "false_positive",
  "needs_better_sources",
]);

function isValidAsset(value: unknown): value is UserAsset {
  if (!value || typeof value !== "object") return false;
  const asset = value as Record<string, unknown>;
  return (
    typeof asset.id === "string" &&
    asset.id.length > 0 &&
    typeof asset.name === "string" &&
    asset.name.length > 0 &&
    typeof asset.country === "string" &&
    asset.country.length > 0 &&
    typeof asset.lat === "number" &&
    Number.isFinite(asset.lat) &&
    asset.lat >= -90 &&
    asset.lat <= 90 &&
    typeof asset.lon === "number" &&
    Number.isFinite(asset.lon) &&
    asset.lon >= -180 &&
    asset.lon <= 180 &&
    typeof asset.type === "string" &&
    VALID_ASSET_TYPES.has(asset.type) &&
    typeof asset.importance === "string" &&
    VALID_IMPORTANCE.has(asset.importance)
  );
}

function isValidFeedback(value: unknown): value is AlertFeedback {
  if (!value || typeof value !== "object") return false;
  const feedback = value as Record<string, unknown>;
  return (
    typeof feedback.alertId === "string" &&
    feedback.alertId.length > 0 &&
    typeof feedback.assetId === "string" &&
    feedback.assetId.length > 0 &&
    typeof feedback.createdAt === "string" &&
    feedback.createdAt.length > 0 &&
    typeof feedback.value === "string" &&
    VALID_FEEDBACK_VALUES.has(feedback.value)
  );
}

export function loadAssets(): UserAsset[] {
  if (!hasStorage()) return [];
  const parsed = safeParse<unknown[]>(window.localStorage.getItem(ASSETS_KEY));
  return Array.isArray(parsed) ? parsed.filter(isValidAsset) : [];
}

export function saveAssets(assets: UserAsset[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(ASSETS_KEY, JSON.stringify(assets));
  } catch {
    /* localStorage may be full or unavailable; ignore silently for MVP */
  }
}

export function clearAssets(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(ASSETS_KEY);
  } catch {
    /* ignore */
  }
}

export function loadFeedback(): AlertFeedback[] {
  if (!hasStorage()) return [];
  const parsed = safeParse<unknown[]>(window.localStorage.getItem(FEEDBACK_KEY));
  return Array.isArray(parsed) ? parsed.filter(isValidFeedback) : [];
}

export function saveFeedback(feedback: AlertFeedback[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(FEEDBACK_KEY, JSON.stringify(feedback));
  } catch {
    /* ignore */
  }
}

export function addFeedback(entry: AlertFeedback): AlertFeedback[] {
  const current = loadFeedback();
  const next = [entry, ...current.filter((f) => !(f.alertId === entry.alertId && f.value === entry.value))];
  saveFeedback(next);
  return next;
}
