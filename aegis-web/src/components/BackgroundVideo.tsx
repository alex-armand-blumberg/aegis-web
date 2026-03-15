"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  src: string;
  containerClassName: string;
  overlayClassName?: string;
  videoClassName?: string;
};

export default function BackgroundVideo({
  src,
  containerClassName,
  overlayClassName,
  videoClassName,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  function togglePause() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPaused(false);
    } else {
      v.pause();
      setPaused(true);
    }
  }

  const controls = (
    <div className="bg-video-controls" aria-hidden>
        <button
          type="button"
          onClick={togglePause}
          title={paused ? "Play video" : "Pause video"}
          className="bg-video-btn"
        >
          {paused ? "▶" : "⏸"}
        </button>
        <button
          type="button"
          onClick={() => setHidden((h) => !h)}
          title={hidden ? "Show background" : "Hide background"}
          className="bg-video-btn"
        >
          {hidden ? "Show" : "✕"}
        </button>
      </div>
  );

  return (
    <>
      <div
        className={`${containerClassName} ${hidden ? "bg-video-hidden" : ""}`}
        aria-hidden
      >
        <video
          ref={videoRef}
          className={videoClassName}
          autoPlay
          muted
          loop
          playsInline
          src={src}
        />
        {overlayClassName && (
          <div className={`bg-video-overlay ${overlayClassName}`} aria-hidden />
        )}
        <img
          src="/earth-bg.png"
          alt=""
          className={`bg-video-fallback ${hidden ? "bg-video-fallback-visible" : ""}`}
          aria-hidden
        />
      </div>
      {mounted && createPortal(controls, document.body)}
    </>
  );
}
