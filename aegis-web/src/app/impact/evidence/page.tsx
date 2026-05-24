"use client";

import { Suspense } from "react";
import { ImpactAppGate } from "../shared/ImpactAppGate";
import { EvidenceView } from "./EvidenceView";

function EvidencePageContent() {
  return (
    <ImpactAppGate>
      {({ selectedAssetIds }) => <EvidenceView selectedAssetIds={selectedAssetIds} />}
    </ImpactAppGate>
  );
}

export default function EvidencePage() {
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
      <EvidencePageContent />
    </Suspense>
  );
}
