"use client";

import { useCallback, useState } from "react";
import { MarketingNav } from "@/components/ui/MarketingNav";
import { SiteFooter } from "@/components/ui/SiteFooter";
import type { UserAsset } from "@/lib/impact/types";
import type { OnboardingSource } from "./onboardingStorage";
import { StepSource } from "./StepSource";
import { StepSelect } from "./StepSelect";

type Step = "source" | "select";

type Props = {
  onComplete: (opts: { source: OnboardingSource; selectedAssetIds: string[] }) => void;
};

export function OnboardingFlow({ onComplete }: Props) {
  const [step, setStep] = useState<Step>("source");
  const [source, setSource] = useState<OnboardingSource>("sample");
  const [assets, setAssets] = useState<UserAsset[]>([]);

  const handleSourceContinue = useCallback((nextSource: OnboardingSource, nextAssets: UserAsset[]) => {
    setSource(nextSource);
    setAssets(nextAssets);
    setStep("select");
  }, []);

  const handleBack = useCallback(() => {
    setStep("source");
    setAssets([]);
  }, []);

  const handleSelectComplete = useCallback(
    (selectedAssetIds: string[]) => {
      onComplete({ source, selectedAssetIds });
    },
    [onComplete, source]
  );

  return (
    <div className="impact-v2 iv-onboard-page">
      <MarketingNav minimalAppLinks />

      <main className="iv-onboard-main">
        <div className="iv-onboard-shell">
          {step === "source" ? (
            <StepSource onContinue={handleSourceContinue} />
          ) : (
            <StepSelect
              assets={assets}
              source={source}
              onBack={handleBack}
              onComplete={handleSelectComplete}
            />
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
