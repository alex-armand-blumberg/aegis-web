"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useContactModal } from "./ContactModalContext";

type AppRouteNavProps = {
  className?: string;
  /** Compact strip with flyout menu on small viewports (map workspace). */
  variant?: "default" | "map";
};

export function AppRouteNav({ className = "", variant = "default" }: AppRouteNavProps) {
  const pathname = usePathname();
  const { openContact } = useContactModal();
  const [menuOpen, setMenuOpen] = useState(false);

  const linkCls = (href: string) => {
    const active = href === "/" ? pathname === "/" : pathname === href;
    return `app-route-nav-link${active ? " is-active" : ""}`;
  };

  const links = (
    <>
      <Link href="/" className={linkCls("/")} onClick={() => setMenuOpen(false)}>
        Home
      </Link>
      <Link href="/escalation" className={linkCls("/escalation")} onClick={() => setMenuOpen(false)}>
        Index
      </Link>
      <Link href="/map" className={linkCls("/map")} onClick={() => setMenuOpen(false)}>
        Map
      </Link>
      <Link href="/limitations" className={linkCls("/limitations")} onClick={() => setMenuOpen(false)}>
        Limitations
      </Link>
      <button
        type="button"
        className="app-route-nav-link app-route-nav-btn"
        onClick={() => {
          setMenuOpen(false);
          openContact();
        }}
      >
        Contact
      </button>
    </>
  );

  if (variant === "map") {
    return (
      <nav className={`app-route-nav app-route-nav-map ${className}`.trim()} aria-label="Site sections">
        <Link href="/" className="app-route-nav-brand">
          AEG<span>I</span>S
        </Link>
        <button
          type="button"
          className="app-route-nav-menu-btn"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          Menu
        </button>
        <div className={`app-route-nav-links app-route-nav-links-map ${menuOpen ? "is-open" : ""}`}>{links}</div>
      </nav>
    );
  }

  return (
    <nav className={`app-route-nav ${className}`.trim()} aria-label="Site sections">
      <Link href="/" className="app-route-nav-brand">
        AEG<span>I</span>S
      </Link>
      <div className="app-route-nav-links">{links}</div>
    </nav>
  );
}
