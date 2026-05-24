"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { loadAssets } from "@/lib/impact/storage";
import { OnboardingFlow } from "../onboarding/OnboardingFlow";
import {
  clearOnboarding,
  isOnboardingReady,
  loadOnboarding,
  markComplete,
  type OnboardingState,
} from "../onboarding/onboardingStorage";

type Props = {
  children: (ctx: { selectedAssetIds: string[] }) => ReactNode;
};

export function ImpactAppGate({ children }: Props) {
  const [ready, setReady] = useState(false);
  const [showApp, setShowApp] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);

  useEffect(() => {
    const state = loadOnboarding();
    const assets = loadAssets();
    const canShowApp = isOnboardingReady(state) && assets.length > 0;
    setOnboarding(state);
    setShowApp(canShowApp);
    setReady(true);
  }, []);

  const handleOnboardingComplete = useCallback(
    (opts: { source: "sample" | "csv"; selectedAssetIds: string[] }) => {
      const next = markComplete(opts);
      setOnboarding(next);
      setShowApp(true);
    },
    []
  );

  const handleChangeAssets = useCallback(() => {
    clearOnboarding();
    setOnboarding(loadOnboarding());
    setShowApp(false);
  }, []);

  if (!ready) {
    return (
      <div className="impact-v2 iv-onboard-page">
        <main className="iv-onboard-main">
          <div className="iv-onboard-shell">
            <p className="iv-meta">Loading…</p>
          </div>
        </main>
      </div>
    );
  }

  if (!showApp) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  const selectedAssetIds = onboarding?.selectedAssetIds ?? [];

  return (
    <div className="impact-v2 iv-dashboard-gate">
      <div className="iv-reset-bar">
        <button type="button" className="iv-reset-link" onClick={handleChangeAssets}>
          Change assets
        </button>
        {selectedAssetIds.length ? (
          <span className="iv-reset-meta">
            Monitoring {selectedAssetIds.length} asset
            {selectedAssetIds.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      {children({ selectedAssetIds })}
    </div>
  );
}
