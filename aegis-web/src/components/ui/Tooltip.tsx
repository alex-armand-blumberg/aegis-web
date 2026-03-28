"use client";

import type { ReactNode } from "react";

type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Hover/focus disclosure; keep content concise for readability. */
export function Tooltip({ content, children, className = "" }: TooltipProps) {
  return (
    <span className={`ui-tooltip-wrap ${className}`.trim()}>
      <button type="button" className="ui-tooltip-trigger" aria-label="More info">
        {children}
      </button>
      <span className="ui-tooltip-bubble" role="tooltip">
        {content}
      </span>
    </span>
  );
}
