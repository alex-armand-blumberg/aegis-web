"use client";

import { useEffect, useState, useRef } from "react";

const DURATION_MS = 2000;

type Props = {
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
  style?: React.CSSProperties;
};

export default function AnimatedNumberOnView({
  value,
  decimals = 0,
  suffix = "",
  prefix = "",
  className = "",
  style,
}: Props) {
  const [displayValue, setDisplayValue] = useState(0);
  const hasAnimated = useRef(false);
  const ref = useRef<HTMLSpanElement>(null);

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
          const current =
            decimals > 0
              ? Number((eased * value).toFixed(decimals))
              : Math.round(eased * value);
          setDisplayValue(current);
          if (progress < 1) {
            frameId = window.requestAnimationFrame(tick);
          }
        };

        frameId = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(frameId);
      },
      { threshold: 0.2 }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [value, decimals]);

  const formatted =
    decimals > 0
      ? displayValue.toFixed(decimals)
      : displayValue.toLocaleString();

  return (
    <span ref={ref} className={className} style={style}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
