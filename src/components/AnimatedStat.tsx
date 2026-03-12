"use client";

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 700;
const TICK_INTERVAL_MS = 25;
const START_DELAY_MS = 700;

type Props = {
  value: number;
  suffix?: string;
  label: string;
  redSuffix?: boolean;
};

export default function AnimatedStat({ value, suffix, label, redSuffix }: Props) {
  const [displayValue, setDisplayValue] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // In the browser, window.setTimeout returns a number; using number here avoids
  // the Node.js Timeout vs DOM number typing mismatch in production builds.
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (hasAnimated) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        timeoutRef.current = window.setTimeout(() => setHasAnimated(true), START_DELAY_MS);
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [hasAnimated]);

  // Animate once, from 0 → value, when hasAnimated flips true.
  useEffect(() => {
    if (!hasAnimated) return;

    let frameId: number;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / DURATION_MS, 1);
      // ease-out: fast start, slow end
      const eased = 1 - Math.pow(1 - progress, 2);
      const current = Math.round(eased * value);
      setDisplayValue(current);
      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frameId);
  }, [hasAnimated, value]);

  return (
    <div ref={ref} className="text-center min-w-[120px] sm:min-w-[140px]">
      <div className="font-bebas text-[42px] sm:text-[48px] tracking-[0.06em] leading-none text-white">
        {displayValue}
        {suffix != null && (
          <span className={redSuffix ? "text-[#ef4444]" : undefined}>{suffix}</span>
        )}
      </div>
      <div className="mt-3 font-barlow-condensed text-[11px] uppercase tracking-[0.18em] text-[var(--dim)] leading-tight">
        {label}
      </div>
    </div>
  );
}
