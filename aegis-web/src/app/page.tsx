"use client";

import Link from "next/link";
import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import AnimatedNumberOnView from "@/components/AnimatedNumberOnView";
import AnimatedMethodWeight from "@/components/AnimatedMethodWeight";
import BackgroundVideo from "@/components/BackgroundVideo";
import { useContactModal } from "@/components/ui/ContactModalContext";
import { MarketingNav } from "@/components/ui/MarketingNav";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { CtaBand } from "@/components/ui/CtaBand";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { prefetchMapExperience } from "@/lib/instantLoad";

export default function Home() {
  const { openContact } = useContactModal();
  const router = useRouter();
  const warmMap = useCallback(() => {
    router.prefetch("/map");
    void prefetchMapExperience();
  }, [router]);

  useEffect(() => {
    const revealObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
          } else {
            e.target.classList.remove("visible");
          }
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll(".reveal").forEach((el) => revealObs.observe(el));

    const barObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("bar-visible");
          } else {
            e.target.classList.remove("bar-visible");
          }
        });
      },
      { threshold: 0.3 }
    );
    document.querySelectorAll(".method-item").forEach((el) => barObs.observe(el));

    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener("click", (e) => {
        const id = a.getAttribute("href");
        if (id === "#") return;
        const target = document.querySelector(id ?? "");
        if (target) {
          e.preventDefault();
          const top = target.getBoundingClientRect().top + window.scrollY - 72;
          window.scrollTo({ top, behavior: "smooth" });
        }
      });
    });
  }, []);

  useEffect(() => {
    const warm = () => warmMap();
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof idleWindow.requestIdleCallback === "function") {
      const id = idleWindow.requestIdleCallback(warm, { timeout: 2500 });
      return () => idleWindow.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(warm, 1200);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <>
      <MarketingNav />

      <section id="hero" className="hero-with-video">
        <BackgroundVideo
          src="/hero-bg.mp4"
          containerClassName="hero-video-bg"
          posterSrc="/earth-bg.png"
        />
        <div className="hero-tag">Palantir Valley Forge Grant Demo</div>
        <h1>AegisHQ</h1>
        <p className="hero-sub">
          Advanced Early-Warning &amp; Geostrategic Intelligence System
        </p>
        <div className="hero-buttons">
          <Link href="/escalation" className="btn-primary">
            Launch Demo &rarr;
          </Link>
          <Link href="/map" className="btn-secondary" onMouseEnter={warmMap} onFocus={warmMap}>
            Interactive Map
          </Link>
          <a href="#features" className="btn-secondary btn-learn-more">
            Learn More
          </a>
        </div>
        <div className="hero-stats">
          <div className="stat">
            <div className="stat-num">
              <AnimatedNumberOnView value={190} suffix="+" suffixClassName="stat-plus-accent" />
            </div>
            <div className="stat-label">Countries &amp; regions</div>
          </div>
          <div className="stat">
            <div className="stat-num">
              <AnimatedNumberOnView value={16} />
            </div>
            <div className="stat-label">Intel layer types</div>
          </div>
          <div className="stat">
            <div className="stat-num">
              <AnimatedNumberOnView value={8} suffix="+" suffixClassName="stat-plus-accent" />
            </div>
            <div className="stat-label">Years of history</div>
          </div>
          <div className="stat">
            <div className="stat-num">AI</div>
            <div className="stat-label">Powered Analysis</div>
          </div>
        </div>
      </section>

      <div className="divider" />

      <section id="features" className="section-ambient">
        <div className="section">
          <SectionHeader
            className="reveal"
            eyebrow="Capabilities"
            title="What AEGIS Does"
            description="A global risk intelligence platform that tracks conflict escalation patterns, surfaces early-warning signals, and delivers AI-powered geopolitical analysis — before situations deteriorate."
          />
          <div className="features-grid reveal">
            <Link href="/escalation" className="feature-card" style={{ "--accent": "#ef4444" } as React.CSSProperties}>
              <div className="feature-icon">📊</div>
              <div className="feature-title">Escalation Index</div>
              <div className="feature-desc">
                A composite monthly index (0–100) built from six leading
                indicators — event frequency acceleration, explosions, strategic
                developments, civil unrest, and civilian targeting ratio.
                Separates intensity from acceleration to catch both sustained
                conflicts and newly escalating ones.
              </div>
              <span className="feature-tag">Leading Indicators</span>
            </Link>
            <Link
              href="/map"
              className="feature-card"
              style={{ "--accent": "#3b82f6" } as React.CSSProperties}
              onMouseEnter={warmMap}
              onFocus={warmMap}
            >
              <div className="feature-icon">🌐</div>
              <div className="feature-title">Interactive Map</div>
              <div className="feature-desc">
                A 3D globe and 2D map visualizing conflict hotspots globally.
                Click any data point to see a full breakdown of event types —
                battles, explosions, strategic developments, protests, riots, and
                civilian violence — with country-level aggregates.
              </div>
              <span className="feature-tag">Real-Time Data</span>
            </Link>
            <Link href="/escalation" className="feature-card" style={{ "--accent": "#a78bfa" } as React.CSSProperties}>
              <div className="feature-icon">⚡</div>
              <div className="feature-title">AI Analysis</div>
              <div className="feature-desc">
                AI-generated country insights, trend interpretation, and
                comparative analysis — connecting index data to real-world
                events. Ask any question about a country&apos;s conflict profile
                and receive a specific, data-grounded answer.
              </div>
              <span className="feature-tag">Groq · Llama 3.1</span>
            </Link>
          </div>
        </div>
      </section>

      <section id="about" className="section-ambient">
        <div className="section">
          <div className="inner">
            <div className="about-text">
              <SectionHeader
                className="reveal"
                eyebrow="Background"
                title={
                  <>
                    Built by a Student.
                    <br />
                    Serious by Design.
                  </>
                }
              />
              <p className="section-body reveal">
                AEGIS was built independently by Alexander Armand-Blumberg, a
                high school student with a lifelong passion for defense policy,
                geopolitics, and security research. What started as a question —
                <em> what signals precede a conflict escalating?</em> — became a
                full-stack intelligence platform.
              </p>
              <p className="section-body reveal" style={{ marginTop: "16px" }}>
                The name comes from Greek mythology. The Aegis was the divine
                shield of Athena — not just armor, but an instrument of
                foreknowledge and strategic clarity. That&apos;s the mission:
                give decision-makers clarity before the crisis arrives.
              </p>
              <div
                className="reveal"
                style={{ marginTop: "32px", display: "flex", gap: "16px", flexWrap: "wrap" }}
              >
                <a
                  href="https://www.linkedin.com/in/alexanderbab/"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                  style={{ padding: "10px 22px", fontSize: "12px" }}
                >
                  LinkedIn
                </a>
                <a
                  href="https://github.com/alex-armand-blumberg/aegis-web"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                  style={{ padding: "10px 22px", fontSize: "12px" }}
                >
                  GitHub
                </a>
              </div>
            </div>
            <div className="about-card reveal">
              <div className="about-card-label">Sample Index Output — Ukraine</div>
              <div className="index-row">
                <span className="index-label">Status</span>
                <span className="index-val" style={{ color: "#ef4444" }}>
                  ESCALATION FLAGGED
                </span>
              </div>
              <div className="index-row">
                <span className="index-label">Smoothed Index</span>
                <span className="index-val">
                  <AnimatedNumberOnView value={82.4} decimals={1} />
                </span>
              </div>
              <div className="index-row">
                <span className="index-label">Trend</span>
                <span className="index-val" style={{ color: "#ef4444" }}>
                  Rising ▲
                </span>
              </div>
              <div className="index-row">
                <span className="index-label">Peak Month</span>
                <span className="index-val">Mar 2022</span>
              </div>
              <div className="index-row">
                <span className="index-label">Flagged Months</span>
                <span className="index-val">
                  <AnimatedNumberOnView value={24} />
                </span>
              </div>
              <div className="index-row">
                <span className="index-label">Recorded Fatalities</span>
                <span className="index-val" style={{ color: "#ef4444" }}>
                  <AnimatedNumberOnView value={41203} />
                </span>
              </div>
              <div
                style={{
                  marginTop: "18px",
                  paddingTop: "12px",
                  borderTop: "1px solid rgba(255,255,255,0.07)",
                  fontSize: "11px",
                  color: "rgba(255,255,255,0.25)",
                  fontFamily: "'Barlow Condensed', sans-serif",
                  letterSpacing: "0.06em",
                }}
              >
                See{" "}
                <Link
                  href="/data"
                  style={{
                    color: "rgba(255,255,255,0.38)",
                    textDecoration: "underline",
                  }}
                >
                  Data &amp; sources
                </Link>{" "}
                for feeds and provenance.
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="divider" />

      <section id="methodology" className="section-ambient">
        <div className="section">
          <div className="methodology-header">
            <SectionHeader
              className="reveal flex-1"
              eyebrow="How It Works"
              title="The Index Methodology"
              description={
                <>
                  Six components, each normalized globally by percentile rank, combined into a single weighted score.
                  The design separates <em>intensity</em> (how bad is it now?) from <em>acceleration</em> (is it getting
                  worse?) — because both matter for different reasons.
                </>
              }
            />
            <div className="methodology-logo reveal">
              <img src="/aegis-logo.png" alt="AEGIS" />
            </div>
          </div>
            <div className="method-grid">
            {[
              { w: 30, name: "Raw Conflict Intensity", desc: "Battles + explosions in absolute terms. Ensures sustained wars like Ukraine score high even with flat month-over-month change.", bar: "30%" },
              { w: 20, name: "Event Frequency Acceleration", desc: "Month-over-month % change in total events. Catches countries entering or re-escalating conflict before intensity peaks.", bar: "20%" },
              { w: 20, name: "Explosions / Remote Violence", desc: "Shelling, airstrikes, drone strikes, IEDs. Precede ground battle fatalities — a leading signal of escalating military operations.", bar: "20%" },
              { w: 15, name: "Strategic Developments", desc: "Troop movements, HQ changes, ceasefire collapses, territorial control shifts. Signal intent and capability changes.", bar: "15%" },
              { w: 10, name: "Civil Unrest", desc: "Protests + riots. Social instability often precedes armed conflict escalation — a leading indicator of political breakdown.", bar: "10%" },
              { w: 5, name: "Civilian Targeting Ratio", desc: "Violence against civilians as a proportion of total violent events. A shift toward civilians signals strategic deterioration.", bar: "5%" },
            ].map((item) => (
              <div key={item.name} className="method-item reveal">
                <AnimatedMethodWeight value={item.w} className="method-weight" />
                <div className="method-inner">
                  <div className="method-name">{item.name}</div>
                  <div className="method-bar-track">
                    <div className="method-bar-fill" style={{ width: item.bar }} />
                  </div>
                  <div className="method-desc">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="divider" />

      <section id="cta">
        <CtaBand
          className="reveal"
          eyebrow="Get Started"
          title="See It Before It Happens."
          description="AEGIS is live and currently free to use. Track any country&apos;s escalation index, explore the global conflict map, and generate AI-powered intelligence briefings in seconds."
          actions={
            <>
              <Link href="/escalation" className="btn-primary">
                Launch Demo &rarr;
              </Link>
              <button type="button" onClick={openContact} className="btn-secondary">
                Contact
              </button>
            </>
          }
        />
      </section>

      <SiteFooter />
    </>
  );
}
