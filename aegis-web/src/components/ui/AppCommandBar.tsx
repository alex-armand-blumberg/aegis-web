"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCommandPalette } from "./CommandPaletteContext";

type AppCommandBarProps = {
  /** Show left brand link (hide when page already uses MarketingNav). */
  showBrand?: boolean;
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
  showBrand = true,
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
        {showBrand ? (
          <Link href="/" className="app-command-bar-logo">
            AEG<span>I</span>S
          </Link>
        ) : null}
        <div className="app-command-bar-title-block">
          <div className="app-command-bar-title">{title}</div>
          {syncLabel ? <div className="app-command-bar-sync">{syncLabel}</div> : null}
        </div>
        {statusSlot}
        {centerSlot}
      </div>
      <div className="app-command-bar-actions">
        {trailingSlot}
        <span className="app-command-icon-wrap">
          <button
            type="button"
            className="app-command-icon-btn"
            title="Search & commands (⌘K)"
            aria-label="Open command palette"
            onClick={() => setOpen(true)}
          >
            ⌘K
          </button>
          <span className="app-command-icon-hint" aria-hidden="true">
            Search &amp; commands
          </span>
        </span>
        {onRefresh ? (
          <span className="app-command-icon-wrap">
            <button type="button" className="app-command-icon-btn" title="Refresh" aria-label="Refresh" onClick={onRefresh}>
              ↻
            </button>
            <span className="app-command-icon-hint" aria-hidden="true">
              Refresh
            </span>
          </span>
        ) : null}
        {onRecenter ? (
          <span className="app-command-icon-wrap">
            <button
              type="button"
              className="app-command-icon-btn"
              title="Recenter map"
              aria-label="Recenter map"
              onClick={onRecenter}
            >
              ⊙
            </button>
            <span className="app-command-icon-hint" aria-hidden="true">
              Recenter
            </span>
          </span>
        ) : null}
        {onFullscreen ? (
          <span className="app-command-icon-wrap">
            <button
              type="button"
              className="app-command-icon-btn"
              title="Fullscreen"
              aria-label="Fullscreen"
              onClick={onFullscreen}
            >
              ⛶
            </button>
            <span className="app-command-icon-hint" aria-hidden="true">
              Fullscreen
            </span>
          </span>
        ) : null}
        {onHelp ? (
          <span className="app-command-icon-wrap">
            <button type="button" className="app-command-icon-btn" title="Help" aria-label="Help" onClick={onHelp}>
              ?
            </button>
            <span className="app-command-icon-hint" aria-hidden="true">
              Help
            </span>
          </span>
        ) : null}
      </div>
    </header>
  );
}
