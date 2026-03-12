"use client";

import { useEffect, useState } from "react";

const DURATION_MS = 600;

type Props = {
  value: number;
  suffix?: string;
  label: string;
  redSuffix?: boolean;
};

export default function AnimatedStat({ value, suffix, label, redSuffix }: Props) {
  const [displayValue, setDisplayValue] = useState(0);
  // Animate once, from 0 → value, on first client render.
  useEffect(() => {
    let frameId: number;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / DURATION_MS, 1);
      // ease-out: fast start, slow end
      const eased = 1 - Math.pow(1 - progress, 2); // ease-out
      const current = Math.round(eased * value);
      setDisplayValue(current);
      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frameId);
  }, [value]);

  return (
    <div className="stat text-center min-w-[100px]">
      <div className="stat-num font-bebas text-[36px] tracking-[0.06em] leading-none text-white">
        {displayValue}
        {suffix != null && (
          <span className={redSuffix ? "text-[#ef4444]" : undefined}>{suffix}</span>
        )}
      </div>
      <div className="stat-label mt-1 font-barlow-condensed text-[10px] uppercase tracking-[0.18em] text-[var(--dim)] leading-tight">
        {label}
      </div>
    </div>
  );
}
