"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "aegis-wip-first-visit-dismissed";

type FirstVisitWipModalProps = {
  deploymentDisplay: string;
};

export function FirstVisitWipModal({ deploymentDisplay }: FirstVisitWipModalProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && !window.localStorage.getItem(STORAGE_KEY)) {
        setOpen(true);
      }
    } catch {
      setOpen(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore quota / private mode */
    }
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <div
      className="wip-first-visit-backdrop"
      role="presentation"
      onClick={dismiss}
      aria-hidden={false}
    >
      <div
        className="wip-first-visit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wip-first-visit-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="wip-first-visit-title" className="wip-first-visit-title">
          Work in progress
        </h2>
        <p className="wip-first-visit-body">
          AEGIS is an independent research prototype. The experience, data pipelines, and analysis tools are still
          evolving—expect rough edges and incomplete coverage while improvements continue to be made.
        </p>
        <p className="wip-first-visit-meta">
          Last change: <strong>{deploymentDisplay} EST</strong>
        </p>
        <div className="wip-first-visit-actions">
          <button type="button" className="btn-primary" onClick={dismiss}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
