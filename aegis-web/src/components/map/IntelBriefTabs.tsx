"use client";

import type { ReactNode } from "react";

export type IntelBriefTabId =
  | "overview"
  | "signals"
  | "sources"
  | "summary"
  | "related"
  | "markets";

type TabDef = {
  id: IntelBriefTabId;
  label: string;
};

type IntelBriefTabsProps = {
  tabs: TabDef[];
  active: IntelBriefTabId;
  onChange: (id: IntelBriefTabId) => void;
  className?: string;
};

export function IntelBriefTabs({ tabs, active, onChange, className = "" }: IntelBriefTabsProps) {
  if (tabs.length === 0) return null;
  return (
    <div className={`map-intel-tabs ${className}`.trim()} role="tablist" aria-label="Brief sections">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className={`map-intel-tab ${active === t.id ? "map-intel-tab-active" : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

type IntelBriefTabPanelProps = {
  id: IntelBriefTabId;
  active: IntelBriefTabId;
  children: ReactNode;
};

export function IntelBriefTabPanel({ id, active, children }: IntelBriefTabPanelProps) {
  if (id !== active) return null;
  return (
    <div
      role="tabpanel"
      className="map-intel-tab-panel"
    >
      {children}
    </div>
  );
}
