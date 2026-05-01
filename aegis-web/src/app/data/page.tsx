"use client";

import Link from "next/link";
import { useEffect } from "react";
import { MarketingNav } from "@/components/ui/MarketingNav";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { getDataSourceSections } from "@/lib/dataSourcesCatalog";

const sections = getDataSourceSections();

export default function DataPage() {
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
    <div className="data-page min-h-screen text-[#e2e8f0]">
      <MarketingNav />

      <main className="data-page-main relative z-10 pt-24 pb-16">
        <section>
          <div className="section">
            <SectionHeader
              className="reveal data-page-title-wrap"
              eyebrow="Transparency"
              title="Data & sources"
              description={
                <>
                  Every major feed, publisher, and adapter AEGIS can draw on. Availability depends on configuration,
                  keys, and upstream service health — see the map diagnostics panel for live status.
                </>
              }
            />
          </div>
        </section>

        <div className="divider" />

        <section>
          <div className="section data-page-content">
            {sections.map((block) => (
              <div key={block.id} className="limitations-block reveal data-source-block">
                <h2 className="limitations-block-heading">{block.title}</h2>
                {block.description ? (
                  <p className="data-page-block-desc">{block.description}</p>
                ) : null}
                <ul className="data-page-source-list">
                  {block.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="reveal data-page-footnote text-sm text-slate-500 mt-8 max-w-2xl">
              Historical escalation index aggregates use researcher-tier conflict event data with a defined end-date lag;
              details are on{" "}
              <Link href="/limitations" className="text-slate-400 underline hover:text-white">
                Limitations
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
