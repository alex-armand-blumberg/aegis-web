"use client";

import type { ReactNode } from "react";
import AnimatedNumber from "@/components/AnimatedNumber";
import AnimatedNumberOnView from "@/components/AnimatedNumberOnView";

export type MetricCardVariant =
  | "headline"
  | "delta"
  | "severity"
  | "freshness"
  | "compact"
  | "comparison";

type MetricCardProps = {
  variant?: MetricCardVariant;
  label: string;
  /** When set with numeric `value`, shows animated count-up */
  value?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Raw display when `value` omitted */
  displayValue?: ReactNode;
  animateOnView?: boolean;
  delta?: { direction: "up" | "down" | "flat"; text: string };
  statusColor?: string;
  caveat?: ReactNode;
  icon?: ReactNode;
  tooltip?: ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyLabel?: string;
  interactive?: boolean;
  onDrill?: () => void;
  className?: string;
};

export function MetricCard({
  variant = "headline",
  label,
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  displayValue,
  animateOnView = false,
  delta,
  statusColor,
  caveat,
  icon,
  tooltip,
  loading,
  empty,
  emptyLabel = "—",
  interactive,
  onDrill,
  className = "",
}: MetricCardProps) {
  const compact = variant === "compact";
  const base = `ui-metric-card ${compact ? "ui-metric-card-compact" : ""} ${
    interactive || onDrill ? "ui-metric-card-interactive cursor-pointer" : ""
  } ${className}`.trim();

  const inner = (
    <>
      {icon ? <div className="mb-1 opacity-80">{icon}</div> : null}
      <div className="ui-metric-label">{label}</div>
      {loading ? (
        <div className="ui-metric-skeleton mt-1" />
      ) : empty ? (
        <div className="ui-metric-empty">{emptyLabel}</div>
      ) : value != null ? (
        <div className="ui-metric-value" style={statusColor ? { color: statusColor } : undefined}>
          {animateOnView ? (
            <AnimatedNumberOnView
              value={value}
              decimals={decimals}
              prefix={prefix}
              suffix={suffix}
            />
          ) : (
            <AnimatedNumber
              value={value}
              decimals={decimals}
              prefix={prefix}
              suffix={suffix}
            />
          )}
        </div>
      ) : (
        <div className="ui-metric-value" style={statusColor ? { color: statusColor } : undefined}>
          {displayValue}
        </div>
      )}
      {delta && !loading && !empty ? (
        <div
          className={`ui-metric-delta ${
            delta.direction === "up"
              ? "ui-metric-delta-up"
              : delta.direction === "down"
                ? "ui-metric-delta-down"
                : ""
          }`}
        >
          {delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "◆"}{" "}
          {delta.text}
        </div>
      ) : null}
      {caveat ? <div className="ui-metric-caveat">{caveat}</div> : null}
      {tooltip ? <div className="ui-metric-caveat">{tooltip}</div> : null}
    </>
  );

  if (onDrill) {
    return (
      <button type="button" className={`${base} text-left w-full`} onClick={onDrill}>
        {inner}
      </button>
    );
  }

  return <div className={base}>{inner}</div>;
}
