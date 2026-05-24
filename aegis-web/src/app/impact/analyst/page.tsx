"use client";

import { Suspense } from "react";
import { ImpactAppGate } from "../shared/ImpactAppGate";
import { AnalystView } from "./AnalystView";

function AnalystPageContent() {
  return (
    <ImpactAppGate>
      {({ selectedAssetIds }) => <AnalystView selectedAssetIds={selectedAssetIds} />}
    </ImpactAppGate>
  );
}

export default function AnalystPage() {
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
      <AnalystPageContent />
    </Suspense>
  );
}
