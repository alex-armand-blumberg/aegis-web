"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AnimatedNumber from "@/components/AnimatedNumber";
import AnimatedNumberOnView from "@/components/AnimatedNumberOnView";
import AnimatedMethodWeight from "@/components/AnimatedMethodWeight";
import ContactModal from "@/components/ContactModal";
import BackgroundVideo from "@/components/BackgroundVideo";

export default function Home() {
  const [contactOpen, setContactOpen] = useState(false);

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

  return (
    <>
      <nav>
        <Link href="/" className="nav-logo">
          AEG<span>I</span>S<sub className="logo-hq">hq</sub>
        </Link>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#about">About</a>
          <a href="#methodology">Methodology</a>
          <button
            type="button"
            onClick={() => setContactOpen(true)}
            className="nav-link-btn"
          >
            Contact
          </button>
          <Link href="/escalation" className="nav-cta">
            Launch Demo
          </Link>
        </div>
      </nav>

      <section id="hero" className="hero-with-video">
        <BackgroundVideo
          src="/hero-bg.mp4"
          containerClassName="hero-video-bg"
        />
        <div className="hero-tag">Palantir demo</div>
        <h1>AegisHQ</h1>
        <p className="hero-sub">
          Advanced Early-Warning &amp; Geostrategic Intelligence System
        </p>
        <div className="hero-buttons">
          <Link href="/escalation" className="btn-primary">
            Launch Demo &rarr;
          </Link>
          <Link href="/map" className="btn-secondary">
            Interactive Map
          </Link>
          <a href="#features" className="btn-secondary btn-learn-more">
            Learn More
          </a>
        </div>
        <div className="hero-stats">
          <div className="stat">
            <div className="stat-num">
              <AnimatedNumber value={180} suffix="+" suffixClassName="stat-plus-accent" />
            </div>
            <div className="stat-label">Countries &amp; regions</div>
          </div>
          <div className="stat">
            <div className="stat-num">
              <AnimatedNumber value={16} />
            </div>
            <div className="stat-label">Intel layer types</div>
          </div>
          <div className="stat">
            <div className="stat-num">
              <AnimatedNumber value={8} suffix="+" suffixClassName="stat-plus-accent" />
            </div>
            <div className="stat-label">Years of ACLED history</div>
          </div>
          <div className="stat">
            <div className="stat-num">AI</div>
            <div className="stat-label">Powered Analysis</div>
          </div>
        </div>
      </section>

      <div className="divider" />

      <section id="features">
        <div className="section">
          <p className="section-tag reveal">Capabilities</p>
          <h2 className="reveal">What AEGIS Does</h2>
          <p className="section-body reveal">
            A global risk intelligence platform that tracks conflict escalation
            patterns, surfaces early-warning signals, and delivers AI-powered
            geopolitical analysis — before situations deteriorate.
          </p>
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
            <Link href="/map" className="feature-card" style={{ "--accent": "#3b82f6" } as React.CSSProperties}>
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

      <div className="divider" />

      <section id="about">
        <div className="section">
          <div className="inner">
            <div className="about-text">
              <p className="section-tag reveal">Background</p>
              <h2 className="reveal">
                Built by a Student.
                <br />
                Serious by Design.
              </h2>
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
                Source:{" "}
                <a
                  href="https://acleddata.com"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: "rgba(255,255,255,0.38)",
                    textDecoration: "underline",
                  }}
                >
                  ACLED (acleddata.com)
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="divider" />

      <section id="methodology">
        <div className="section">
          <p className="section-tag reveal">How It Works</p>
          <div className="methodology-header">
            <h2 className="reveal">The Index Methodology</h2>
            <div className="methodology-logo reveal">
              <img src="/aegis-logo.png" alt="AEGIS" />
            </div>
          </div>
          <p className="section-body reveal">
              Six components, each normalized globally by percentile rank,
              combined into a single weighted score. The design separates{" "}
              <em>intensity</em> (how bad is it now?) from{" "}
              <em>acceleration</em> (is it getting worse?) — because both matter
              for different reasons.
            </p>
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
        <div className="section" style={{ textAlign: "center" }}>
          <p
            className="section-tag reveal"
            style={{ display: "flex", justifyContent: "center" }}
          >
            Get Started
          </p>
          <h2 className="reveal">See It Before It Happens.</h2>
          <p className="section-body reveal">
            AEGIS is live and currently free to use. Track any country&apos;s escalation
            index, explore the global conflict map, and generate AI-powered
            intelligence briefings in seconds.
          </p>
          <div
            className="reveal"
            style={{
              display: "flex",
              gap: "16px",
              flexWrap: "wrap",
              justifyContent: "center",
              marginTop: 0,
            }}
          >
            <Link href="/escalation" className="btn-primary">
              Launch Demo &rarr;
            </Link>
            <button
              type="button"
              onClick={() => setContactOpen(true)}
              className="btn-secondary"
            >
              Contact
            </button>
          </div>
        </div>
      </section>

      <footer>
        <div className="footer-logo">AEGIS</div>
        <div className="footer-links">
          <Link href="/escalation">App</Link>
          <a
            href="https://www.linkedin.com/in/alexanderbab/"
            target="_blank"
            rel="noreferrer"
          >
            LinkedIn
          </a>
          <a
            href="https://github.com/alex-armand-blumberg/aegis-web"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <a href="https://acleddata.com" target="_blank" rel="noreferrer">
            Data: ACLED
          </a>
        </div>
        <div className="footer-copy">
          &copy; 2026 Alexander Armand-Blumberg &middot; AEGIS
        </div>
      </footer>

      <ContactModal isOpen={contactOpen} onClose={() => setContactOpen(false)} />
    </>
  );
}
