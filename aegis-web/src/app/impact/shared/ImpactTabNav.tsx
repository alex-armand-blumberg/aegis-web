"use client";

import Link from "next/link";
import type { ImpactRangeOption } from "./useImpactMapData";

type Tab = "dashboard" | "evidence" | "sources" | "analyst" | "network";

type Props = {
  active: Tab;
  assetId?: string | null;
  range?: ImpactRangeOption;
};

function buildHref(tab: Tab, assetId?: string | null, range?: ImpactRangeOption): string {
  const base =
    tab === "dashboard"
      ? "/impact"
      : tab === "evidence"
        ? "/impact/evidence"
        : tab === "network"
          ? "/impact/network"
          : tab === "sources"
            ? "/impact/sources"
            : "/impact/analyst";
  const params = new URLSearchParams();
  if (assetId) params.set("asset", assetId);
  if (range) params.set("range", range);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function ImpactTabNav({ active, assetId, range }: Props) {
  return (
    <nav className="iv-tab-nav" aria-label="Impact views">
      <Link
        href={buildHref("dashboard", assetId, range)}
        className={`iv-tab-nav-link${active === "dashboard" ? " is-active" : ""}`}
        aria-current={active === "dashboard" ? "page" : undefined}
      >
        Dashboard
      </Link>
      <Link
        href={buildHref("evidence", assetId, range)}
        className={`iv-tab-nav-link${active === "evidence" ? " is-active" : ""}`}
        aria-current={active === "evidence" ? "page" : undefined}
      >
        Evidence
      </Link>
      <Link
        href={buildHref("network", assetId, range)}
        className={`iv-tab-nav-link${active === "network" ? " is-active" : ""}`}
        aria-current={active === "network" ? "page" : undefined}
      >
        Network
      </Link>
      <Link
        href={buildHref("sources", assetId, range)}
        className={`iv-tab-nav-link${active === "sources" ? " is-active" : ""}`}
        aria-current={active === "sources" ? "page" : undefined}
      >
        Sources
      </Link>
      <Link
        href={buildHref("analyst", assetId, range)}
        className={`iv-tab-nav-link${active === "analyst" ? " is-active" : ""}`}
        aria-current={active === "analyst" ? "page" : undefined}
      >
        Analyst
      </Link>
    </nav>
  );
}
