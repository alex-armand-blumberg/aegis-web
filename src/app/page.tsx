import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <video
        className="pointer-events-none fixed inset-0 h-full w-full object-cover opacity-40 grayscale-[55%] contrast-110"
        src="/landing.mp4"
        autoPlay
        muted
        loop
        playsInline
      />

      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-slate-950/40 via-slate-950/70 to-slate-950" />

      <header className="relative z-10 flex items-center justify-between px-6 py-4 sm:px-10">
        <div className="flex items-center gap-3">
          <div className="relative h-9 w-9 sm:h-10 sm:w-10">
            <Image
              src="/aegis-logo.png"
              alt="AEGIS logo"
              fill
              sizes="40px"
              className="object-contain drop-shadow-[0_0_18px_rgba(15,23,42,0.9)]"
              priority
            />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-300">
              AEGIS
            </span>
            <span className="text-[10px] font-medium text-slate-500">
              Advanced Early-Warning &amp; Geostrategic Intelligence System
            </span>
          </div>
        </div>

        <nav className="hidden items-center gap-4 text-xs font-medium text-slate-300 sm:flex">
          <Link
            href="/escalation"
            className="rounded-md px-3 py-1.5 transition hover:bg-slate-800/80"
          >
            Escalation Index
          </Link>
          <Link
            href="/map"
            className="rounded-md px-3 py-1.5 transition hover:bg-slate-800/80"
          >
            Interactive Map
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col items-center justify-center px-6 pb-14 pt-10 sm:px-10">
        <section className="flex w-full flex-col items-center gap-10 text-center sm:items-start sm:text-left">
          <div>
            <p className="tagline mb-4 text-[10px] font-semibold uppercase text-rose-400">
              ■ Palantir Valley Forge Grant Demo
            </p>
            <h1 className="text-5xl font-black tracking-tight text-slate-50 drop-shadow-[0_0_80px_rgba(0,0,0,0.9)] sm:text-7xl">
              AEGIS
            </h1>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">
              Advanced Early-Warning &amp; Geostrategic Intelligence System
            </p>
            <p className="mt-6 max-w-xl text-sm leading-relaxed text-slate-300/80">
              AEGIS ingests ACLED conflict data to surface{" "}
              <span className="font-semibold text-slate-50">
                measurable precursor signals
              </span>{" "}
              of escalation—before they become headline news. Built for
              researchers, analysts, and operators who need decision-ready risk
              in one view.
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-stretch">
            <Link href="/escalation" className="btn-primary w-full sm:w-auto">
              <span className="text-base">📊 Escalation Index</span>
            </Link>
            <Link href="/map" className="btn-secondary w-full sm:w-auto">
              <span className="text-base">🗺️ Interactive Map</span>
            </Link>
          </div>

          <section className="grid w-full gap-6 rounded-xl border border-slate-800/80 bg-slate-950/80 p-5 backdrop-blur-md sm:grid-cols-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Escalation Index
              </h2>
              <p className="mt-2 text-xs text-slate-400">
                Composite 0–100 index across six weighted sub-indicators,
                flagging escalation events, pre-escalation windows, and a
                3‑month forward trend.
              </p>
            </div>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Global Conflict Map
              </h2>
              <p className="mt-2 text-xs text-slate-400">
                2D map and 3D globe built on ACLED&apos;s public ArcGIS layer,
                with battles, explosions, civilian targeting, protests, and
                riots in one view.
              </p>
            </div>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                AI Intelligence Layer
              </h2>
              <p className="mt-2 text-xs text-slate-400">
                LLM-generated briefs that interpret the index, compare
                countries, and summarize hotspots—anchored in underlying event
                data.
              </p>
            </div>
          </section>

          <footer className="mt-4 flex w-full flex-col items-center justify-between gap-2 text-[10px] text-slate-500 sm:flex-row">
            <p>
              Built by{" "}
              <a
                href="https://www.linkedin.com/in/alexanderbab/"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-slate-600 underline-offset-4 hover:text-slate-300"
              >
                Alexander Armand-Blumberg
              </a>{" "}
              · AEGIS
            </p>
            <p className="text-[9px]">
              Background footage: Public Domain (CC0). Data source: ACLED.
            </p>
          </footer>
        </section>
      </main>
    </div>
  );
}
