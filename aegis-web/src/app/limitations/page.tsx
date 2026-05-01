"use client";

import Link from "next/link";
import { useEffect } from "react";
import BackgroundVideo from "@/components/BackgroundVideo";
import { MarketingNav } from "@/components/ui/MarketingNav";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { TransparencyModule } from "@/components/ui/TransparencyModule";

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
        posterSrc="/limitations-bg.png"
      />
      <MarketingNav />

      <main className="limitations-page-main relative z-10 pt-8">
        <section>
          <div className="section">
            <SectionHeader
              className="reveal limitations-page-title-wrap"
              eyebrow="About"
              title="Limitations"
              description="AEGIS is transparent about data tier, lag, and model boundaries. This page tracks what is live today and what is planned next."
            />
            <TransparencyModule
              className="reveal mt-6"
              title="At a glance"
              items={[
                <>
                  Escalation index uses researcher-tier monthly aggregates through one year before today; the
                  interactive map can lag publication by about one to two months at this access tier.
                </>,
                <>AI summaries are assistive — they do not replace primary sources or professional judgment.</>,
              ]}
            />
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

      <SiteFooter />
    </div>
  );
}
