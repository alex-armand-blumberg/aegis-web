import type { ReactNode } from "react";
import { StatusChip, type StatusChipVariant } from "./StatusChip";

export type WatchlistCardProps = {
  rank: number;
  name: string;
  scoreLabel?: string;
  severity?: StatusChipVariant;
  trend?: string;
  reason?: ReactNode;
  barPercent?: number;
  sparkline?: ReactNode;
  sourceHint?: string;
  onClick?: () => void;
  className?: string;
};

export function WatchlistCard({
  rank,
  name,
  scoreLabel,
  severity,
  trend,
  reason,
  barPercent,
  sparkline,
  sourceHint,
  onClick,
  className = "",
}: WatchlistCardProps) {
  const inner = (
    <>
      <div className="flex items-start gap-3">
        <span className="ui-watchlist-rank">{rank}</span>
        <div className="min-w-0 flex-1">
          <div className="ui-watchlist-top">
            <strong className="truncate text-white">{name}</strong>
            {scoreLabel ? <span className="shrink-0 text-xs text-slate-400">{scoreLabel}</span> : null}
          </div>
          <div className="ui-watchlist-meta flex flex-wrap items-center gap-2">
            {trend ? <span>Trend: {trend}</span> : null}
            {severity ? (
              <StatusChip variant={severity}>{severity}</StatusChip>
            ) : null}
            {sourceHint ? <span>· {sourceHint}</span> : null}
          </div>
          {barPercent != null ? (
            <div className="ui-watchlist-bar">
              <div className="ui-watchlist-bar-fill" style={{ width: `${barPercent}%` }} />
            </div>
          ) : null}
          {sparkline ? <div className="mt-2">{sparkline}</div> : null}
          {reason ? <div className="mt-2 text-xs leading-relaxed text-slate-500">{reason}</div> : null}
        </div>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={`ui-watchlist-card ${className}`.trim()} onClick={onClick}>
        {inner}
      </button>
    );
  }

  return <div className={`ui-watchlist-card cursor-default ${className}`.trim()}>{inner}</div>;
}
