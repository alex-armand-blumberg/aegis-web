import { loadAssets } from "@/lib/impact/storage";

export const ONBOARDING_KEY = "aegis-impact-onboarding-v2";

export type OnboardingSource = "sample" | "csv";

export type OnboardingState = {
  version: 2;
  completed: boolean;
  completedAt?: string;
  source?: OnboardingSource;
  selectedAssetIds: string[];
};

export const DEFAULT_ONBOARDING: OnboardingState = {
  version: 2,
  completed: false,
  selectedAssetIds: [],
};

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeParse(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isValidOnboarding(value: unknown): value is OnboardingState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  if (state.version !== 2) return false;
  if (typeof state.completed !== "boolean") return false;
  if (!Array.isArray(state.selectedAssetIds)) return false;
  if (!state.selectedAssetIds.every((id) => typeof id === "string")) return false;
  if (state.source !== undefined && state.source !== "sample" && state.source !== "csv") {
    return false;
  }
  if (state.completedAt !== undefined && typeof state.completedAt !== "string") return false;
  return true;
}

export function loadOnboarding(): OnboardingState {
  if (!hasStorage()) return { ...DEFAULT_ONBOARDING };
  const parsed = safeParse(window.localStorage.getItem(ONBOARDING_KEY));
  if (!isValidOnboarding(parsed)) return { ...DEFAULT_ONBOARDING };
  return parsed;
}

export function saveOnboarding(state: OnboardingState): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(ONBOARDING_KEY, JSON.stringify(state));
  } catch {
    /* localStorage may be full or unavailable */
  }
}

export function clearOnboarding(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(ONBOARDING_KEY);
  } catch {
    /* ignore */
  }
}

export function markComplete(opts: {
  source: OnboardingSource;
  selectedAssetIds: string[];
}): OnboardingState {
  const state: OnboardingState = {
    version: 2,
    completed: true,
    completedAt: new Date().toISOString(),
    source: opts.source,
    selectedAssetIds: opts.selectedAssetIds,
  };
  saveOnboarding(state);
  return state;
}

/** Returns true when onboarding is complete and selected assets still exist. */
export function isOnboardingReady(state: OnboardingState): boolean {
  if (!state.completed) return false;
  if (state.selectedAssetIds.length === 0) return false;

  const assets = loadAssets();
  if (assets.length === 0) return false;

  const assetIdSet = new Set(assets.map((a) => a.id));
  const hasOverlap = state.selectedAssetIds.some((id) => assetIdSet.has(id));
  return hasOverlap;
}
