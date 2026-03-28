import Link from "next/link";

type SiteFooterProps = {
  showCta?: boolean;
  className?: string;
};

export function SiteFooter({ showCta = true, className = "" }: SiteFooterProps) {
  return (
    <footer className={`site-footer-enhanced ${className}`.trim()}>
      <div className="site-footer-grid">
        <div>
          <div className="site-footer-brand">
            AEG<span>I</span>S
          </div>
          <p className="mt-3 max-w-xs text-sm text-slate-500">
            Advanced early-warning and geostrategic intelligence — escalation signals, live map, and
            transparent methodology.
          </p>
        </div>
        <div className="site-footer-col">
          <div className="site-footer-col-title">Product</div>
          <Link href="/escalation">Escalation index</Link>
          <Link href="/map">Interactive map</Link>
          {showCta ? (
            <Link href="/escalation" className="text-red-400 hover:text-red-300">
              Launch demo →
            </Link>
          ) : null}
        </div>
        <div className="site-footer-col">
          <div className="site-footer-col-title">Trust</div>
          <Link href="/limitations">Limitations & coverage</Link>
          <Link href="/#methodology">Methodology</Link>
          <a href="https://acleddata.com" target="_blank" rel="noreferrer">
            Data: ACLED
          </a>
        </div>
        <div className="site-footer-col">
          <div className="site-footer-col-title">Contact</div>
          <a href="https://www.linkedin.com/in/alexanderbab/" target="_blank" rel="noreferrer">
            LinkedIn
          </a>
          <a href="https://github.com/alex-armand-blumberg/aegis-web" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </div>
      <div className="site-footer-signature">
        © {new Date().getFullYear()} Alexander Armand-Blumberg · AEGIS · Independent research prototype
      </div>
    </footer>
  );
}
