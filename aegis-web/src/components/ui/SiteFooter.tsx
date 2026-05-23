"use client";

import Link from "next/link";
import { AegisLogo } from "./AegisLogo";
import { useContactModal } from "./ContactModalContext";

type SiteFooterProps = {
  showCta?: boolean;
  className?: string;
};

const DISCLAIMER =
  "Independent student-built prototype. Not a company, commercial service, government system, or official intelligence platform. Not affiliated with any existing Aegis-branded organization. For educational demonstration only.";

export function SiteFooter({ showCta = true, className = "" }: SiteFooterProps) {
  const { openContact } = useContactModal();

  return (
    <footer className={`site-footer-enhanced ${className}`.trim()}>
      <div className="site-footer-grid">
        <div>
          <AegisLogo href="/" size="footer" />
          <p className="mt-3 max-w-xs text-sm text-slate-500">
            Advanced early-warning and geostrategic intelligence — escalation signals and live map.
          </p>
        </div>
        <div className="site-footer-col">
          <div className="site-footer-col-title">Product</div>
          <Link href="/escalation">Escalation index</Link>
          <Link href="/map">Interactive map</Link>
          {showCta ? (
            <Link href="/escalation" className="site-footer-cta-link">
              Launch demo →
            </Link>
          ) : null}
        </div>
        <div className="site-footer-col">
          <div className="site-footer-col-title">Trust</div>
          <Link href="/limitations">Limitations & coverage</Link>
          <Link href="/#methodology">Methodology</Link>
          <Link href="/data">Data</Link>
        </div>
        <div className="site-footer-col">
          <div className="site-footer-col-title">Contact</div>
          <a href="https://www.linkedin.com/in/alexanderbab/" target="_blank" rel="noreferrer">
            LinkedIn
          </a>
          <a href="https://github.com/alex-armand-blumberg/aegis-web" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <button type="button" onClick={openContact} className="site-footer-contact-btn">
            Contact
          </button>
        </div>
      </div>
      <details className="site-footer-disclaimer">
        <summary>Prototype disclaimer</summary>
        <p>{DISCLAIMER}</p>
      </details>
      <div className="site-footer-signature">
        © {new Date().getFullYear()} Alexander Armand-Blumberg · AEGIS · Independent research prototype
      </div>
    </footer>
  );
}
