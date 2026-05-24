"use client";

import { Suspense } from "react";
import { ImpactAppGate } from "../shared/ImpactAppGate";
import { NetworkView } from "./NetworkView";

function NetworkPageContent() {
  return (
    <ImpactAppGate>
      {({ selectedAssetIds }) => <NetworkView selectedAssetIds={selectedAssetIds} />}
    </ImpactAppGate>
  );
}

export default function NetworkPage() {
  return (
    <Suspense
      fallback={
        <div className="impact-v2 iv-onboard-page">
          <main className="iv-onboard-main">
            <div className="iv-onboard-shell">
              <p className="iv-meta">Loading…</p>
            </div>
          </main>
        </div>
      }
    >
      <NetworkPageContent />
    </Suspense>
  );
}
