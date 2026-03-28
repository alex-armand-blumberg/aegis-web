"use client";

import { useEffect, useRef, useState } from "react";

/** Small metric animation; effect drives rAF updates. */
export function useCountUp(target: number, durationMs = 600, enabled = true): number {
  const [value, setValue] = useState(0);
  const currentRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      currentRef.current = target;
      /* eslint-disable react-hooks/set-state-in-effect -- sync displayed value when animation disabled */
      setValue(target);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    const from = currentRef.current;
    let raf: number;
    const t0 = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      const v = Math.round(from + (target - from) * eased);
      currentRef.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, enabled]);

  return value;
}
