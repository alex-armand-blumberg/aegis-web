import type { ReactNode } from "react";

type ChartFrameProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  controls?: ReactNode;
  legend?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function ChartFrame({
  title,
  subtitle,
  controls,
  legend,
  children,
  footer,
  className = "",
}: ChartFrameProps) {
  const showHead = Boolean(title) || Boolean(subtitle) || Boolean(controls);

  return (
    <section className={`ui-chart-frame ${className}`.trim()}>
      {showHead ? (
      <div className="ui-chart-frame-head">
        <div>
          {title ? <h3 className="ui-chart-frame-title">{title}</h3> : null}
          {subtitle ? <p className="ui-chart-frame-sub">{subtitle}</p> : null}
        </div>
        {controls ? <div className="ui-chart-frame-controls">{controls}</div> : null}
      </div>
      ) : null}
      <div className="ui-chart-frame-body">{children}</div>
      {legend ? <div className="ui-chart-frame-legend">{legend}</div> : null}
      {footer}
    </section>
  );
}
