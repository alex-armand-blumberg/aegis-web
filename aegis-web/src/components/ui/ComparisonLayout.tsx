import type { ReactNode } from "react";

type ComparisonLayoutProps = {
  title?: ReactNode;
  leftTitle: string;
  rightTitle: string;
  left: ReactNode;
  right: ReactNode;
  className?: string;
};

export function ComparisonLayout({
  title,
  leftTitle,
  rightTitle,
  left,
  right,
  className = "",
}: ComparisonLayoutProps) {
  return (
    <div className={className}>
      {title ? <div className="mb-2 text-sm text-slate-400">{title}</div> : null}
      <div className="ui-comparison">
        <div className="ui-comparison-pane">
          <div className="ui-comparison-pane-title">{leftTitle}</div>
          {left}
        </div>
        <div className="ui-comparison-pane">
          <div className="ui-comparison-pane-title">{rightTitle}</div>
          {right}
        </div>
      </div>
    </div>
  );
}
