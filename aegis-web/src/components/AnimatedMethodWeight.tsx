"use client";

import { useEffect, useState, useRef } from "react";

const DURATION_MS = 2000;

type Props = {
  value: number;
  className?: string;
};

export default function AnimatedMethodWeight({ value, className = "" }: Props) {
  const [displayValue, setDisplayValue] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const wasIntersectingRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    wasIntersectingRef.current = false;

    const cancelRaf = () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const run = () => {
      cancelRaf();
      setDisplayValue(0);
      const startTime = performance.now();
      const tick = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / DURATION_MS, 1);
        const eased = 1 - Math.pow(1 - progress, 2);
        setDisplayValue(Math.round(eased * value));
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const obs = new IntersectionObserver(
      (entries) => {
        const intersecting = entries[0].isIntersecting;
        const was = wasIntersectingRef.current;
        wasIntersectingRef.current = intersecting;

        if (!intersecting) {
          cancelRaf();
          setDisplayValue(0);
          return;
        }
        if (intersecting && !was) {
          run();
        }
      },
      { threshold: 0.3 }
    );

    obs.observe(el);
    return () => {
      cancelRaf();
      obs.disconnect();
    };
  }, [value]);

  return (
    <div ref={ref} className={className}>
      {displayValue}%
    </div>
  );
}
