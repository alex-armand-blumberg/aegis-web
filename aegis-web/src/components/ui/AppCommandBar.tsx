"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCommandPalette } from "./CommandPaletteContext";

type AppCommandBarProps = {
  title: string;
  syncLabel?: string;
  /** e.g. range + mode chips */
  statusSlot?: ReactNode;
  centerSlot?: ReactNode;
  onRefresh?: () => void;
  onRecenter?: () => void;
  onFullscreen?: () => void;
  onHelp?: () => void;
  /** Extra status chips */
  trailingSlot?: ReactNode;
  className?: string;
};

export function AppCommandBar({
  title,
  syncLabel,
  statusSlot,
  centerSlot,
  onRefresh,
  onRecenter,
  onFullscreen,
  onHelp,
  trailingSlot,
  className = "",
}: AppCommandBarProps) {
  const { setOpen } = useCommandPalette();

  return (
    <header className={`app-command-bar ${className}`.trim()}>
      <div className="app-command-bar-main">
        <Link href="/" className="app-command-bar-logo">
          AEG<span>I</span>S
        </Link>
        <div className="app-command-bar-title-block">
          <div className="app-command-bar-title">{title}</div>
          {syncLabel ? <div className="app-command-bar-sync">{syncLabel}</div> : null}
        </div>
        {statusSlot}
        {centerSlot}
      </div>
      <div className="app-command-bar-actions">
        {trailingSlot}
        <button
          type="button"
          className="app-command-icon-btn"
          title="Search & commands (⌘K)"
          aria-label="Open command palette"
          onClick={() => setOpen(true)}
        >
          ⌘K
        </button>
        {onRefresh ? (
          <button type="button" className="app-command-icon-btn" title="Refresh" onClick={onRefresh}>
            ↻
          </button>
        ) : null}
        {onRecenter ? (
          <button type="button" className="app-command-icon-btn" title="Recenter" onClick={onRecenter}>
            ⊙
          </button>
        ) : null}
        {onFullscreen ? (
          <button type="button" className="app-command-icon-btn" title="Fullscreen" onClick={onFullscreen}>
            ⛶
          </button>
        ) : null}
        {onHelp ? (
          <button type="button" className="app-command-icon-btn" title="Help" onClick={onHelp}>
            ?
          </button>
        ) : null}
      </div>
    </header>
  );
}
