import Link from "next/link";
import type { ReactNode } from "react";

type MarketingNavProps = {
  onContactClick?: () => void;
  extraLinks?: ReactNode;
  className?: string;
};

export function MarketingNav({ onContactClick, extraLinks, className = "" }: MarketingNavProps) {
  return (
    <div className={`marketing-nav-shell ${className}`.trim()}>
      <nav>
        <Link href="/" className="nav-logo">
          AEG<span>I</span>S<sub className="logo-hq">hq</sub>
        </Link>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#about">About</a>
          <a href="#methodology">Methodology</a>
          {extraLinks}
          {onContactClick ? (
            <button type="button" onClick={onContactClick} className="nav-link-btn">
              Contact
            </button>
          ) : null}
          <Link href="/escalation" className="nav-cta">
            Launch Demo
          </Link>
        </div>
      </nav>
    </div>
  );
}
