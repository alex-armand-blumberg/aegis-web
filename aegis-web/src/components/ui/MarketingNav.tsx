"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useContactModal } from "./ContactModalContext";

type MarketingNavProps = {
  /** Override contact handler; defaults to global Contact modal. */
  onContactClick?: () => void;
  extraLinks?: ReactNode;
  className?: string;
};

export function MarketingNav({ onContactClick, extraLinks, className = "" }: MarketingNavProps) {
  const { openContact } = useContactModal();
  const handleContact = onContactClick ?? openContact;

  return (
    <div className={`marketing-nav-shell ${className}`.trim()}>
      <nav>
        <Link href="/" className="nav-logo">
          AEG<span>I</span>S<sub className="logo-hq">hq</sub>
        </Link>
        <div className="nav-links">
          <Link href="/#features">Features</Link>
          <Link href="/#about">About</Link>
          <Link href="/#methodology">Methodology</Link>
          {extraLinks}
          <button type="button" onClick={handleContact} className="nav-link-btn">
            Contact
          </button>
          <Link href="/escalation" className="nav-cta">
            Launch Demo
          </Link>
        </div>
      </nav>
    </div>
  );
}
