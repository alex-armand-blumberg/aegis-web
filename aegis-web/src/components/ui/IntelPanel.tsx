import type { ReactNode } from "react";

type IntelPanelProps = {
  titleRow?: ReactNode;
  summary?: ReactNode;
  metrics?: ReactNode;
  signals?: ReactNode;
  sources?: ReactNode;
  actions?: ReactNode;
  detail?: ReactNode;
  className?: string;
};

/** Shared frame for region / point intel, methodology blocks, AI summaries. */
export function IntelPanel({
  titleRow,
  summary,
  metrics,
  signals,
  sources,
  actions,
  detail,
  className = "",
}: IntelPanelProps) {
  return (
    <div className={`ui-intel-panel ${className}`.trim()}>
      {titleRow ? <div className="ui-intel-panel-title-row">{titleRow}</div> : null}
      {summary ? <div className="ui-intel-panel-summary">{summary}</div> : null}
      {metrics ? <div className="ui-intel-panel-metrics">{metrics}</div> : null}
      {signals ? (
        <>
          <div className="ui-intel-panel-section-label">Active signals</div>
          {signals}
        </>
      ) : null}
      {sources ? (
        <>
          <div className="ui-intel-panel-section-label">Sources</div>
          {sources}
        </>
      ) : null}
      {actions ? <div className="ui-intel-panel-actions">{actions}</div> : null}
      {detail ? <div className="mt-3 border-t border-white/10 pt-3">{detail}</div> : null}
    </div>
  );
}
