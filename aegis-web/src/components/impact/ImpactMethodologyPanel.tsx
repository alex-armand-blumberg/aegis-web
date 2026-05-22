"use client";

export function ImpactMethodologyPanel() {
  return (
    <details className="impact-method-strip">
      <summary>
        <span className="impact-method-strip-eyebrow">Methodology · safety · privacy</span>
        <span className="impact-method-strip-pills">
          <span className="impact-method-pill">Score ≠ prediction</span>
          <span className="impact-method-pill">Confidence is separate</span>
          <span className="impact-method-pill">Do not upload sensitive lists</span>
        </span>
        <span className="impact-method-strip-cta">Expand</span>
      </summary>
      <div className="impact-method-strip-body">
        <div className="impact-method-strip-col">
          <h3>How exposure is calculated</h3>
          <ol className="impact-method-steps">
            <li>
              <strong>Public signals.</strong> AEGIS reads the existing public-source map feeds
              (conflict, news, infrastructure, maritime, humanitarian, disaster, escalation context).
            </li>
            <li>
              <strong>Normalize and cluster.</strong> Raw points are normalized into signals and
              clustered when they likely describe the same event — so repeated headlines do not
              inflate volume.
            </li>
            <li>
              <strong>Compare to your assets.</strong> Each evidence cluster is scored against each
              asset using proximity, severity, recency, source reliability, source diversity, asset
              relevance, asset importance, and country context.
            </li>
            <li>
              <strong>Apply caps.</strong> News-only, model-only, same-country-only, stale, and
              coarse-geolocation alerts are capped to prevent overclaiming.
            </li>
            <li>
              <strong>Confidence is separate.</strong> Confidence reflects source diversity,
              reliability, geolocation precision, freshness, and provider health — not score.
            </li>
          </ol>
        </div>
        <div className="impact-method-strip-col">
          <h3>What this is, and what it is not</h3>
          <ul className="impact-method-notes">
            <li>
              Exposure scores are <strong>not predictions</strong>. They rank public-source signal
              pressure around user-defined assets and should be reviewed with the underlying
              evidence.
            </li>
            <li>
              Confidence reflects source quality, source diversity, geolocation precision,
              freshness, and provider health.
            </li>
            <li>
              Evidence quality varies by source and region. Some feeds lag or have incomplete
              geolocation. Human review is required.
            </li>
            <li>
              Do not upload sensitive or confidential asset lists into this prototype. Assets
              stay in your browser unless you explicitly generate an AI brief.
            </li>
          </ul>
        </div>
      </div>
    </details>
  );
}
