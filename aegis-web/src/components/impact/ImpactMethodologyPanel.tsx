"use client";

export function ImpactMethodologyPanel() {
  return (
    <section className="impact-methodology">
      <header>
        <span className="impact-eyebrow">Methodology</span>
        <h2>How exposure is calculated</h2>
      </header>
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
      <ul className="impact-method-notes">
        <li>
          Exposure scores are <strong>not predictions</strong>. They rank public-source signal
          pressure around user-defined assets and should be reviewed with the underlying evidence.
        </li>
        <li>
          Confidence reflects source quality, source diversity, geolocation precision, freshness,
          and provider health.
        </li>
        <li>
          Evidence quality varies by source and region. Some feeds lag or have incomplete
          geolocation. Human review is required.
        </li>
        <li>
          Do not upload sensitive or confidential asset lists into this prototype. Assets stay
          in your browser unless you explicitly generate an AI brief.
        </li>
      </ul>
    </section>
  );
}
