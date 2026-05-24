"use client";

import { Suspense } from "react";
import { ImpactAppGate } from "../shared/ImpactAppGate";
import { SourcesView } from "./SourcesView";

function SourcesPageContent() {
  return (
    <ImpactAppGate>
      {({ selectedAssetIds }) => <SourcesView selectedAssetIds={selectedAssetIds} />}
    </ImpactAppGate>
  );
}

export default function SourcesPage() {
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
      <SourcesPageContent />
    </Suspense>
  );
}
