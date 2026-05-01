"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useContactModal } from "./ContactModalContext";

type MarketingNavProps = {
  /** Override contact handler; defaults to global Contact modal. */
  onContactClick?: () => void;
  extraLinks?: ReactNode;
  className?: string;
};

function navActiveClass(pathname: string | null, href: string): string | undefined {
  if (!pathname) return undefined;
  return pathname === href || pathname.startsWith(`${href}/`) ? "is-active" : undefined;
}

export function MarketingNav({ onContactClick, extraLinks, className = "" }: MarketingNavProps) {
  const pathname = usePathname();
  const { openContact } = useContactModal();
  const handleContact = onContactClick ?? openContact;

  const isHome = pathname === "/";
  const variant = isHome ? "home" : "app";

  let cta: ReactNode;
  if (isHome) {
    cta = (
      <Link href="/escalation" className="nav-cta">
        Launch Demo
      </Link>
    );
  } else if (pathname === "/escalation" || pathname?.startsWith("/escalation/")) {
    cta = (
      <Link href="/map" className="nav-cta">
        Interactive Map
      </Link>
    );
  } else {
    cta = (
      <Link href="/escalation" className="nav-cta">
        Launch Demo
      </Link>
    );
  }

  return (
    <div className={`marketing-nav-shell ${className}`.trim()} data-variant={variant}>
      <nav>
        <Link href="/" className="nav-logo">
          AEG<span>I</span>S<sub className="logo-hq">hq</sub>
        </Link>
        <div className="nav-links">
          {isHome ? (
            <>
              <Link href="/#features">Features</Link>
              <Link href="/#about">About</Link>
              <Link href="/#methodology">Methodology</Link>
            </>
          ) : (
            <>
              <Link href="/map" className={navActiveClass(pathname, "/map")}>
                Map
              </Link>
              <Link href="/escalation" className={navActiveClass(pathname, "/escalation")}>
                Escalation
              </Link>
              <Link href="/data" className={navActiveClass(pathname, "/data")}>
                Data
              </Link>
              <Link href="/limitations" className={navActiveClass(pathname, "/limitations")}>
                Limitations
              </Link>
            </>
          )}
          {extraLinks}
          <button type="button" onClick={handleContact} className="nav-link-btn">
            Contact
          </button>
          {cta}
        </div>
      </nav>
      <div className="marketing-nav-spacer" aria-hidden />
    </div>
  );
}
