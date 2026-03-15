"use client";

import { useEffect, useState, useRef } from "react";

const DURATION_MS = 2000;

type Props = {
  value: number;
  className?: string;
};

export default function AnimatedMethodWeight({ value, className = "" }: Props) {
  const [displayValue, setDisplayValue] = useState(0);
  const hasAnimated = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (hasAnimated.current) return;
        hasAnimated.current = true;

        let frameId: number;
        const startTime = performance.now();

        const tick = (now: number) => {
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / DURATION_MS, 1);
          const eased = 1 - Math.pow(1 - progress, 2);
          setDisplayValue(Math.round(eased * value));
          if (progress < 1) {
            frameId = window.requestAnimationFrame(tick);
          }
        };

        frameId = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(frameId);
      },
      { threshold: 0.3 }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [value]);

  return (
    <div ref={ref} className={className}>
      {displayValue}%
    </div>
  );
}
