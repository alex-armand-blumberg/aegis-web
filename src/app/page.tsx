import Link from "next/link";
import Reveal from "@/components/Reveal";
import AnimatedStat from "@/components/AnimatedStat";

export default function Home() {
  return (
    <>
      {/* Nav — more top padding, grey links, Launch App button with better proportions */}
      <nav className="fixed left-0 right-0 top-0 z-[100] flex items-center justify-between bg-gradient-to-b from-[#020611]/95 to-transparent px-6 pt-6 pb-4 backdrop-blur-[4px] min-[901px]:px-12 min-[901px]:pt-8 min-[901px]:pb-5">
        <Link href="/" className="font-bebas text-[22px] tracking-[0.12em] text-white">
          AEG<span className="text-[var(--red)]">I</span>S
        </Link>
        <div className="nav-desktop flex items-center gap-8">
          <a href="#features" className="font-barlow-condensed text-[12px] font-semibold uppercase tracking-[0.14em] text-white/50 transition hover:text-white/80">
            Features
          </a>
          <a href="#about" className="font-barlow-condensed text-[12px] font-semibold uppercase tracking-[0.14em] text-white/50 transition hover:text-white/80">
            About
          </a>
          <a href="#methodology" className="font-barlow-condensed text-[12px] font-semibold uppercase tracking-[0.14em] text-white/50 transition hover:text-white/80">
            Methodology
          </a>
          <Link
            href="/escalation"
            className="ml-6 inline-flex items-center justify-center rounded px-6 py-2.5 font-barlow-condensed text-[12px] font-semibold uppercase tracking-wider text-white transition hover:opacity-90"
            style={{ backgroundColor: "var(--red)" }}
          >
            Launch App
          </Link>
        </div>
      </nav>

      {/* Hero — full viewport, centered, scroll-snap, 48px padding */}
      <section id="hero" className="snap-section relative z-10 flex min-h-screen flex-col items-center justify-center px-12 pb-20 pt-[120px] text-center">
        <div className="absolute top-[55%] left-1/2 z-0 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(ellipse,rgba(59,130,246,0.10)_0%,transparent_70%)] pointer-events-none" />
        <p className="hero-tag relative z-10 mb-[22px] font-barlow-condensed text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--red)] opacity-0 animate-[fadeUp_0.6s_0.1s_forwards" style={{ animationFillMode: "forwards" }}>
          ■ Palantir Valley Forge Grant Demo
        </p>
        <h1 className="relative z-10 bg-transparent font-bebas text-[clamp(86px,16vw,180px)] leading-[0.9] tracking-[0.04em] text-white opacity-0 animate-[fadeUp_0.7s_0.2s_forwards]" style={{ animationFillMode: "forwards" }}>
          AEGIS
        </h1>
        <p className="hero-sub relative z-10 mt-10 mb-16 font-barlow-condensed text-[clamp(12px,1.6vw,16px)] font-light uppercase tracking-[0.22em] text-[rgba(226,232,240,0.65)] opacity-0 animate-[fadeUp_0.7s_0.35s_forwards]" style={{ animationFillMode: "forwards" }}>
          Advanced Early-Warning &amp; Geostrategic Intelligence System
        </p>
        <div className="hero-buttons relative z-10 flex flex-wrap justify-center gap-4 opacity-0 animate-[fadeUp_0.7s_0.5s_forwards]" style={{ animationFillMode: "forwards" }}>
          <Link href="/escalation" className="btn-primary-hero">
            Launch App →
          </Link>
          <a href="#features" className="btn-secondary-hero">
            Learn More
          </a>
        </div>
        <div className="hero-stats hero-stats-responsive relative z-10 mt-[72px] flex flex-wrap justify-center gap-12 opacity-0 animate-[fadeUp_0.7s_0.65s_forwards]" style={{ animationFillMode: "forwards" }}>
          <AnimatedStat value={50} suffix="+" label="Countries Tracked" redSuffix />
          <AnimatedStat value={6} label="Index Components" />
          <AnimatedStat value={7} suffix="+" label="Years of Data" redSuffix />
          <div className="stat text-center min-w-[100px]">
            <div className="stat-num font-bebas text-[36px] tracking-[0.06em] leading-none text-white">AI</div>
            <div className="stat-label mt-1 font-barlow-condensed text-[10px] uppercase tracking-[0.18em] text-[var(--dim)] leading-tight">Powered Analysis</div>
          </div>
        </div>
      </section>

      <div className="relative z-10 section-divider" aria-hidden />

      {/* Features — centered section wrapper, full viewport snap */}
      <section id="features" className="snap-section relative z-10 flex min-h-screen flex-col items-center justify-center bg-[rgba(6,14,35,0.4)] py-0">
        <div className="section section-responsive w-full">
          <Reveal>
            <p className="section-tag mb-3.5 font-barlow-condensed text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--blue)]">
              — Capabilities
            </p>
          </Reveal>
          <Reveal>
            <h2 className="font-bebas text-[clamp(42px,6vw,72px)] leading-none tracking-[0.06em] text-white mb-5">
              What AEGIS Does
            </h2>
          </Reveal>
          <Reveal>
            <p className="section-body max-w-[620px] text-base leading-[1.75] text-[rgba(226,232,240,0.65)]">
              A global risk intelligence platform that tracks conflict escalation patterns, surfaces early-warning signals, and delivers AI-powered geopolitical analysis — before situations deteriorate.
            </p>
          </Reveal>
          <Reveal>
            <div className="features-grid features-grid-responsive mt-14 grid grid-cols-1 gap-0.5 overflow-hidden rounded-lg border border-[var(--dimmer)] min-[901px]:grid-cols-3">
              <Link href="/escalation" className="feature-card flex flex-col bg-[var(--card)] px-8 py-9" style={{ ["--feature-accent" as string]: "#ef4444" }}>
                <div className="feature-icon mb-4 text-[22px]">📊</div>
                <div className="feature-title mb-2.5 font-barlow-condensed text-[18px] font-semibold uppercase tracking-[0.06em] text-white">
                  Escalation Index
                </div>
                <p className="feature-desc flex-1 text-[14px] leading-[1.7] text-[rgba(226,232,240,0.55)]">
                  A composite monthly index (0–100) built from six leading indicators — event frequency acceleration, explosions, strategic developments, civil unrest, and civilian targeting ratio. Separates intensity from acceleration to catch both sustained conflicts and newly escalating ones.
                </p>
                <span className="feature-tag mt-4 inline-block rounded border border-[rgba(59,130,246,0.2)] bg-[rgba(59,130,246,0.12)] px-2.5 py-[3px] font-barlow-condensed text-[10px] font-semibold uppercase tracking-[0.16em] text-[#60a5fa]">
                  Leading Indicators
                </span>
              </Link>
              <Link href="/map" className="feature-card flex flex-col bg-[var(--card)] px-8 py-9" style={{ ["--feature-accent" as string]: "#3b82f6" }}>
                <div className="feature-icon mb-4 text-[22px]">🌐</div>
                <div className="feature-title mb-2.5 font-barlow-condensed text-[18px] font-semibold uppercase tracking-[0.06em] text-white">
                  Interactive Map
                </div>
                <p className="feature-desc flex-1 text-[14px] leading-[1.7] text-[rgba(226,232,240,0.55)]">
                  A 3D globe and 2D map visualizing conflict hotspots globally. Click any data point to see a full breakdown of event types — battles, explosions, strategic developments, protests, riots, and civilian violence — with country-level aggregates.
                </p>
                <span className="feature-tag mt-4 inline-block rounded border border-[rgba(59,130,246,0.2)] bg-[rgba(59,130,246,0.12)] px-2.5 py-[3px] font-barlow-condensed text-[10px] font-semibold uppercase tracking-[0.16em] text-[#60a5fa]">
                  Real-Time Data
                </span>
              </Link>
              <Link href="/escalation" className="feature-card flex flex-col bg-[var(--card)] px-8 py-9" style={{ ["--feature-accent" as string]: "#a78bfa" }}>
                <div className="feature-icon mb-4 text-[22px]">⚡</div>
                <div className="feature-title mb-2.5 font-barlow-condensed text-[18px] font-semibold uppercase tracking-[0.06em] text-white">
                  AI Analysis
                </div>
                <p className="feature-desc flex-1 text-[14px] leading-[1.7] text-[rgba(226,232,240,0.55)]">
                  AI-generated country insights, trend interpretation, and comparative analysis — connecting index data to real-world events. Ask any question about a country&apos;s conflict profile and receive a specific, data-grounded answer.
                </p>
                <span className="feature-tag mt-4 inline-block rounded border border-[rgba(59,130,246,0.2)] bg-[rgba(59,130,246,0.12)] px-2.5 py-[3px] font-barlow-condensed text-[10px] font-semibold uppercase tracking-[0.16em] text-[#60a5fa]">
                  Groq · Llama 3.1
                </span>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <div className="relative z-10 section-divider" aria-hidden />

      {/* About — centered section wrapper, full viewport snap */}
      <section id="about" className="snap-section relative z-10 flex min-h-screen flex-col items-center justify-center py-0">
        <div className="section section-responsive w-full">
          <div className="about-inner-responsive grid grid-cols-1 gap-10 min-[901px]:grid-cols-2 min-[901px]:gap-20">
            <div>
              <Reveal>
                <p className="section-tag mb-3.5 font-barlow-condensed text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--blue)]">
                  — Background
                </p>
              </Reveal>
              <Reveal>
              <h2 className="font-bebas text-[clamp(42px,6vw,72px)] leading-none tracking-wide text-white mb-6">
                Built by a Student.
                <br />
                Serious by Design.
              </h2>
              </Reveal>
              <Reveal>
              <p className="max-w-[620px] text-base leading-[1.75] text-white/65 mb-6">
                AEGIS was built independently by Alexander Armand-Blumberg, a
                high school student with a lifelong passion for defense policy,
                geopolitics, and security research. What started as a question —
                <em> what signals precede a conflict escalating?</em> — became a
                full-stack intelligence platform.
              </p>
              <p className="max-w-[620px] text-base leading-[1.75] text-white/65">
                The name comes from Greek mythology. The Aegis was the divine
                shield of Athena — not just armor, but an instrument of
                foreknowledge and strategic clarity. That&apos;s the mission: give decision-makers clarity before the crisis arrives.
              </p>
              </Reveal>
              <Reveal>
              <div className="mt-8 flex gap-4">
                <a
                  href="https://www.linkedin.com/in/alexanderbab/"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary py-2.5 px-[22px] text-xs"
                >
                  LinkedIn
                </a>
                <a
                  href="https://github.com/alex-armand-blumberg/aegis-web"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary py-2.5 px-[22px] text-xs"
                >
                  GitHub
                </a>
              </div>
              </Reveal>
            </div>
            <Reveal>
            <div className="about-card rounded-lg border border-[var(--dimmer)] bg-[var(--card)] p-8">
              <div className="about-card-label mb-5 font-barlow-condensed text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--dim)]">
                Sample Index Output — Ukraine
              </div>
              <div className="index-row flex justify-between border-b border-white/5 py-2 text-[13px]">
                <span className="index-label font-barlow-condensed text-[11px] uppercase tracking-[0.04em] text-white/50">Status</span>
                <span className="index-val font-bebas text-[18px] tracking-[0.06em] text-[#ef4444]">ESCALATION FLAGGED</span>
              </div>
              <div className="index-row flex justify-between border-b border-white/5 py-2 text-[13px]">
                <span className="index-label font-barlow-condensed text-[11px] uppercase tracking-[0.04em] text-white/50">Smoothed Index</span>
                <span className="index-val font-bebas text-[18px] tracking-[0.06em] text-white">82.4</span>
              </div>
              <div className="index-row flex justify-between border-b border-white/5 py-2 text-[13px]">
                <span className="index-label font-barlow-condensed text-[11px] uppercase tracking-[0.04em] text-white/50">Trend</span>
                <span className="index-val font-bebas text-[18px] tracking-[0.06em] text-[#ef4444]">Rising ▲</span>
              </div>
              <div className="index-row flex justify-between border-b border-white/5 py-2 text-[13px]">
                <span className="index-label font-barlow-condensed text-[11px] uppercase tracking-[0.04em] text-white/50">Peak Month</span>
                <span className="index-val font-bebas text-[18px] tracking-[0.06em] text-white">Mar 2022</span>
              </div>
              <div className="index-row flex justify-between border-b border-white/5 py-2 text-[13px]">
                <span className="index-label font-barlow-condensed text-[11px] uppercase tracking-[0.04em] text-white/50">Flagged Months</span>
                <span className="index-val font-bebas text-[18px] tracking-[0.06em] text-white">24</span>
              </div>
              <div className="index-row flex justify-between border-b border-white/5 py-2 text-[13px] last:border-b-0">
                <span className="index-label font-barlow-condensed text-[11px] uppercase tracking-[0.04em] text-white/50">Recorded Fatalities</span>
                <span className="index-val font-bebas text-[18px] tracking-[0.06em] text-[#ef4444]">41,203</span>
              </div>
              <p className="mt-[18px] font-barlow-condensed text-[11px] tracking-[0.06em] text-white/25">
                Source:{" "}
                <a href="https://acleddata.com" target="_blank" rel="noreferrer" className="text-white/35 underline">
                  ACLED (acleddata.com)
                </a>
              </p>
            </div>
            </Reveal>
          </div>
        </div>
      </section>

      <div className="relative z-10 section-divider" aria-hidden />

      {/* Methodology — centered section wrapper, full viewport snap */}
      <section id="methodology" className="snap-section relative z-10 flex min-h-screen flex-col items-center justify-center bg-[rgba(6,14,35,0.4)] py-0">
        <div className="section section-responsive w-full">
          <Reveal>
            <p className="mb-3.5 font-barlow-condensed text-[10px] font-semibold uppercase tracking-[0.28em] text-[#3b82f6]">
              — How It Works
            </p>
          </Reveal>
          <Reveal>
            <h2 className="font-bebas text-[clamp(42px,6vw,72px)] leading-none tracking-wide text-white mb-6">
              The Index Methodology
            </h2>
          </Reveal>
          <Reveal>
            <p className="max-w-[620px] text-base leading-[1.8] text-white/65">
              Six components, each normalized globally by percentile rank,
              combined into a single weighted score. The design separates{" "}
              <em>intensity</em> (how bad is it now?) from <em>acceleration</em> (is
              it getting worse?) — because both matter for different reasons.
            </p>
          </Reveal>
          <Reveal>
          <div className="method-grid method-grid-responsive mt-12 grid grid-cols-1 gap-4 min-[901px]:grid-cols-2">
            {[
              { weight: "30%", name: "Raw Conflict Intensity", desc: "Battles + explosions in absolute terms. Ensures sustained wars like Ukraine score high even with flat month-over-month change." },
              { weight: "20%", name: "Event Frequency Acceleration", desc: "Month-over-month % change in total events. Catches countries entering or re-escalating conflict before intensity peaks." },
              { weight: "20%", name: "Explosions / Remote Violence", desc: "Shelling, airstrikes, drone strikes, IEDs. Precede ground battle fatalities — a leading signal of escalating military operations." },
              { weight: "15%", name: "Strategic Developments", desc: "Troop movements, HQ changes, ceasefire collapses, territorial control shifts. Signal intent and capability changes." },
              { weight: "10%", name: "Civil Unrest", desc: "Protests + riots. Social instability often precedes armed conflict escalation — a leading indicator of political breakdown." },
              { weight: "5%", name: "Civilian Targeting Ratio", desc: "Violence against civilians as a proportion of total violent events. A shift toward civilians signals strategic deterioration." },
            ].map((item) => (
              <div
                key={item.name}
                className="method-item flex gap-5 items-start rounded-md border border-[var(--dimmer)] bg-[var(--card)] p-6"
              >
                <div className="font-bebas text-[32px] leading-none text-[#ef4444] shrink-0 w-[52px]">
                  {item.weight}
                </div>
                <div>
                  <div className="font-barlow-condensed text-[15px] font-semibold uppercase tracking-[0.06em] text-white mb-1.5">
                    {item.name}
                  </div>
                  <p className="text-[13px] leading-[1.6] text-[rgba(226,232,240,0.5)]">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
          </Reveal>
        </div>
      </section>

      <div className="relative z-10 section-divider" aria-hidden />

      {/* CTA — full viewport snap, centered */}
      <section id="cta" className="snap-section relative z-10 flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] py-[120px] text-center">
        <div className="absolute top-1/2 left-1/2 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(ellipse,rgba(239,68,68,0.08)_0%,transparent_70%)] pointer-events-none" />
        <div className="section section-responsive relative z-10 w-full">
          <Reveal>
            <p className="mb-3.5 flex justify-center font-barlow-condensed text-[10px] font-semibold uppercase tracking-[0.28em] text-[#3b82f6]">
              Get Started
            </p>
          </Reveal>
          <Reveal>
            <h2 className="font-bebas text-[clamp(42px,6vw,72px)] leading-none tracking-wide text-white mb-6">
              See It Before It Happens.
            </h2>
          </Reveal>
          <Reveal>
            <p className="mx-auto max-w-[620px] text-center text-base leading-[1.8] text-white/65 mb-14">
              AEGIS is live and free to use. Track any country&apos;s escalation
              index, explore the global conflict map, and generate AI-powered
              intelligence briefings in seconds.
            </p>
          </Reveal>
          <Reveal>
          <div className="flex flex-wrap justify-center gap-6">
            <Link href="/escalation" className="btn-primary">
              Launch AEGIS →
            </Link>
            <a
              href="https://www.linkedin.com/in/alexanderbab/"
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
            >
              Contact
            </a>
          </div>
          </Reveal>
        </div>
      </section>

      {/* Footer — match index.html: padding 32px 48px, links gap 24px */}
      <footer className="footer-responsive relative z-10 flex items-center justify-between border-t border-[var(--dimmer)] px-6 py-8 min-[901px]:px-12">
        <div className="footer-logo font-bebas text-lg tracking-[0.12em] text-white/40">
          AEGIS
        </div>
        <div className="footer-links flex gap-6">
          <Link href="/escalation" className="font-barlow-condensed text-[11px] uppercase tracking-[0.14em] text-[var(--dim)] transition-colors hover:text-white">
            App
          </Link>
          <a
            href="https://www.linkedin.com/in/alexanderbab/"
            target="_blank"
            rel="noreferrer"
            className="font-barlow-condensed text-[11px] uppercase tracking-[0.14em] text-[var(--dim)] transition hover:text-white"
          >
            LinkedIn
          </a>
          <a
            href="https://github.com/alex-armand-blumberg/aegis-web"
            target="_blank"
            rel="noreferrer"
            className="font-barlow-condensed text-[11px] uppercase tracking-[0.14em] text-[var(--dim)] transition hover:text-white"
          >
            GitHub
          </a>
          <a
            href="https://acleddata.com"
            target="_blank"
            rel="noreferrer"
            className="font-barlow-condensed text-[11px] uppercase tracking-[0.14em] text-[var(--dim)] transition hover:text-white"
          >
            Data: ACLED
          </a>
        </div>
        <div className="footer-copy font-barlow-condensed text-[11px] tracking-[0.08em] text-white/[0.22]">
          © 2026 Alexander Armand-Blumberg · AEGIS
        </div>
      </footer>
    </>
  );
}
