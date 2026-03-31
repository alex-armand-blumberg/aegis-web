"use client";

import { useEffect, useState } from "react";

const HIDE_AFTER_MS = 12_000;
const FADE_MS = 320;

type DeployBannerProps = {
  deploymentDisplay: string;
};

export function DeployBanner({ deploymentDisplay }: DeployBannerProps) {
  const [phase, setPhase] = useState<"visible" | "exiting" | "gone">("visible");

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const hide = () => {
      if (reduceMotion) {
        setPhase("gone");
        return;
      }
      setPhase("exiting");
      window.setTimeout(() => setPhase("gone"), FADE_MS);
    };

    const t = window.setTimeout(hide, HIDE_AFTER_MS);
    return () => window.clearTimeout(t);
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      className={`global-deploy-banner${phase === "exiting" ? " global-deploy-banner--exiting" : ""}`}
      aria-live="polite"
    >
      <span>Latest version</span>
      <strong>{deploymentDisplay} EST</strong>
    </div>
  );
}
