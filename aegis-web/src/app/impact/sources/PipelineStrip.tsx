const STEPS = [
  { title: "Source", subtitle: "Public feeds & APIs" },
  { title: "Normalize", subtitle: "Clean titles, geo, time" },
  { title: "Tier", subtitle: "Operational vs context" },
  { title: "Relate", subtitle: "Distance to your asset" },
  { title: "Map / Evidence", subtitle: "Pins & grouped rows" },
] as const;

export function PipelineStrip() {
  return (
    <section className="iv-sources-pipeline" aria-label="Impact data pipeline">
      <ol className="iv-sources-pipeline-steps">
        {STEPS.map((step, index) => (
          <li key={step.title} className="iv-sources-pipeline-step">
            <span className="iv-sources-pipeline-index">{index + 1}</span>
            <span className="iv-sources-pipeline-body">
              <span className="iv-sources-pipeline-title">{step.title}</span>
              <span className="iv-meta iv-sources-pipeline-subtitle">{step.subtitle}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="iv-meta iv-sources-pipeline-note">
        Impact never shows raw provider JSON in the product UI.
      </p>
    </section>
  );
}
