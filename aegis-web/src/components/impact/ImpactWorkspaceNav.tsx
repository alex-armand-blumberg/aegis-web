"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type LoadState = "idle" | "loading" | "ready" | "error";

type Props = {
  loadState: LoadState;
  providerFailures: number;
};

type NavItem = {
  label: string;
  href?: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Map", href: "/map" },
  { label: "Impact", href: "/impact" },
  { label: "Escalation", href: "/escalation" },
  { label: "Intelligence", href: "/limitations" },
  { label: "Data", href: "/data" },
  { label: "Configuration" },
];

function statusLabel(loadState: LoadState, providerFailures: number): string {
  if (loadState === "loading") return "Syncing";
  if (loadState === "error") return "Signals Unavailable";
  if (loadState === "ready" && providerFailures > 0) return "Degraded";
  if (loadState === "ready") return "Operational";
  return "Standby";
}

function statusClass(loadState: LoadState, providerFailures: number): string {
  if (loadState === "error") return "error";
  if (loadState === "loading") return "loading";
  if (loadState === "ready" && providerFailures > 0) return "degraded";
  if (loadState === "ready") return "operational";
  return "idle";
}

function isActive(pathname: string | null, href?: string): boolean {
  if (!pathname || !href) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ImpactWorkspaceNav({ loadState, providerFailures }: Props) {
  const pathname = usePathname();
  const status = statusLabel(loadState, providerFailures);
  const statusTone = statusClass(loadState, providerFailures);

  return (
    <header className="impact-workspace-nav" aria-label="Impact workspace navigation">
      <div className="impact-workspace-brand">
        <span className="impact-workspace-brand-main">AEGIS</span>
        <span className="impact-workspace-brand-sub">Impact Intelligence</span>
      </div>

      <nav className="impact-workspace-links" aria-label="Primary">
        {NAV_ITEMS.map((item) =>
          item.href ? (
            <Link
              key={item.label}
              href={item.href}
              className={`impact-workspace-link${isActive(pathname, item.href) ? " is-active" : ""}`}
            >
              {item.label}
            </Link>
          ) : (
            <span key={item.label} className="impact-workspace-link impact-workspace-link-muted">
              {item.label}
            </span>
          )
        )}
      </nav>

      <div className="impact-workspace-status">
        <span className="impact-workspace-status-label">System Status</span>
        <span className={`impact-workspace-status-dot impact-workspace-status-${statusTone}`} />
        <span className="impact-workspace-status-value">{status}</span>
      </div>
    </header>
  );
}
