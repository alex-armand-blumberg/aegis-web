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

export function loadAssets(): UserAsset[] {
  if (!hasStorage()) return [];
  const parsed = safeParse<UserAsset[]>(window.localStorage.getItem(ASSETS_KEY));
  return Array.isArray(parsed) ? parsed : [];
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
  const parsed = safeParse<AlertFeedback[]>(window.localStorage.getItem(FEEDBACK_KEY));
  return Array.isArray(parsed) ? parsed : [];
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
