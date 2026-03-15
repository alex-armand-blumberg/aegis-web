"use client";

import { useEffect, useState } from "react";

const DURATION_MS = 2000;

type Props = {
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  suffixClassName?: string;
  className?: string;
  style?: React.CSSProperties;
};

export default function AnimatedNumber({
  value,
  decimals = 0,
  suffix = "",
  prefix = "",
  suffixClassName,
  className = "",
  style,
}: Props) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let frameId: number;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - progress, 2);
      const current = decimals > 0
        ? Number((eased * value).toFixed(decimals))
        : Math.round(eased * value);
      setDisplayValue(current);
      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [value, decimals]);

  const formatted =
    decimals > 0
      ? displayValue.toFixed(decimals)
      : displayValue.toLocaleString();

  const suffixEl = suffix ? (
    suffixClassName ? (
      <span className={suffixClassName}>{suffix}</span>
    ) : (
      suffix
    )
  ) : null;

  return (
    <span className={className} style={style}>
      {prefix}
      {formatted}
      {suffixEl}
    </span>
  );
}
