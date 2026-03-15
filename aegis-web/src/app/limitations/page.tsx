"use client";

import Link from "next/link";
import { useEffect } from "react";
import BackgroundVideo from "@/components/BackgroundVideo";

export default function LimitationsPage() {
  useEffect(() => {
    const revealObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("reveal-visible", "visible");
          } else {
            e.target.classList.remove("reveal-visible", "visible");
          }
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll(".reveal").forEach((el) => revealObs.observe(el));
    return () => revealObs.disconnect();
  }, []);

  return (
    <div className="limitations-page min-h-screen text-[#e2e8f0]">
      <BackgroundVideo
        src="/limitations-bg.mp4"
        containerClassName="limitations-page-video-wrap"
        overlayClassName="limitations-page-video-overlay"
        videoClassName="limitations-page-video"
      />
      <nav className="limitations-page-nav">
        <Link href="/" className="nav-logo">
          AEG<span>I</span>S<sub className="logo-hq">hq</sub>
        </Link>
        <div className="nav-links">
          <Link href="/">← Back to Home</Link>
          <Link href="/escalation">App</Link>
        </div>
      </nav>

      <main className="limitations-page-main relative z-10 pt-24">
        <section>
          <div className="section">
            <p className="section-tag reveal">About</p>
            <h1 className="reveal limitations-page-title">Limitations</h1>
          </div>
        </section>

        <div className="divider" />

        <section>
          <div className="section limitations-content">
            <div className="limitations-block reveal">
              <h2 className="limitations-block-heading">Planned improvements</h2>
              <ul className="limitations-list">
                <li>Get a higher ACLED Tier, giving me access to more data for Escalation Index. The code works the same with more up-to-date data.</li>
                <li>Direct ACLED API for weekly/event-level granularity.</li>
                <li>Actor-level escalation detection.</li>
                <li>ML-based index calibration against historical escalation outcomes.</li>
                <li>Subnational index breakdown.</li>
              </ul>
            </div>

            <div className="limitations-block reveal">
              <h2 className="limitations-block-heading">Current limitations of AEGIS</h2>
              <ul className="limitations-list">
                <li>Only have access to data from Jan 2018 to exactly one year ago for the Escalation Index, as I currently only have Researcher Tier ACLED access.</li>
                <li>Interactive map data has a 1–2 month lag due to my ACLED access tier.</li>
                <li>ACLED public ArcGIS layer for the map is monthly aggregated at subnational level, not individual events.</li>
                <li>Some countries may have sparse data in earlier months.</li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="footer-logo">AEGIS</div>
        <div className="footer-links">
          <Link href="/escalation">App</Link>
          <a href="https://www.linkedin.com/in/alexanderbab/" target="_blank" rel="noreferrer">LinkedIn</a>
          <a href="https://github.com/alex-armand-blumberg/aegis-web" target="_blank" rel="noreferrer">GitHub</a>
          <a href="https://acleddata.com" target="_blank" rel="noreferrer">Data: ACLED</a>
        </div>
        <div className="footer-copy">
          &copy; 2026 Alexander Armand-Blumberg &middot; AEGIS
        </div>
      </footer>
    </div>
  );
}
