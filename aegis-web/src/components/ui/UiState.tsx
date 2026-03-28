import type { ReactNode } from "react";

export type UiStateVariant =
  | "loading"
  | "empty"
  | "error"
  | "degraded"
  | "unavailable"
  | "noResults"
  | "stale"
  | "lowConfidence";

type UiStateProps = {
  variant: UiStateVariant;
  title: string;
  description?: ReactNode;
  className?: string;
};

export function UiState({ variant, title, description, className = "" }: UiStateProps) {
  const extra =
    variant === "error"
      ? "ui-state-error"
      : variant === "degraded" || variant === "unavailable"
        ? "ui-state-degraded"
        : variant === "loading"
          ? "ui-state-loading"
          : variant === "stale" || variant === "lowConfidence"
            ? "ui-state-stale"
            : "";

  return (
    <div className={`ui-state ${extra} ${className}`.trim()}>
      <div className="ui-state-title">{title}</div>
      {description ? <div className="ui-state-body">{description}</div> : null}
    </div>
  );
}
