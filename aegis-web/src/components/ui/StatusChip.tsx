import type { ReactNode } from "react";

export type StatusChipVariant =
  | "ok"
  | "healthy"
  | "degraded"
  | "offline"
  | "live"
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "experimental"
  | "limited";

const variantClass: Record<StatusChipVariant, string> = {
  ok: "ui-status-chip-ok",
  healthy: "ui-status-chip-healthy",
  degraded: "ui-status-chip-degraded",
  offline: "ui-status-chip-offline",
  live: "ui-status-chip-live",
  critical: "ui-status-chip-critical",
  high: "ui-status-chip-high",
  medium: "ui-status-chip-medium",
  low: "ui-status-chip-low",
  experimental: "ui-status-chip-experimental",
  limited: "ui-status-chip-limited",
};

type StatusChipProps = {
  variant: StatusChipVariant;
  children: ReactNode;
  className?: string;
};

export function StatusChip({ variant, children, className = "" }: StatusChipProps) {
  return (
    <span className={`ui-status-chip ${variantClass[variant]} ${className}`.trim()}>
      {children}
    </span>
  );
}
