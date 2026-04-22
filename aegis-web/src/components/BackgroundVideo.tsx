"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  src: string;
  containerClassName: string;
  overlayClassName?: string;
  videoClassName?: string;
  posterSrc?: string;
};

export default function BackgroundVideo({
  src,
  containerClassName,
  overlayClassName,
  videoClassName,
  posterSrc = "/earth-bg.png",
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  // Avoid accessing `document` during SSR; this component is client-side but can still be pre-rendered.
  const mounted = typeof document !== "undefined";

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
          className={`${videoClassName ?? ""} ${videoReady ? "bg-video-ready" : "bg-video-loading"}`.trim()}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster={posterSrc}
          src={src}
          onLoadedData={() => setVideoReady(true)}
        />
        {overlayClassName && (
          <div className={`bg-video-overlay ${overlayClassName}`} aria-hidden />
        )}
        <img
          src={posterSrc}
          alt=""
          className={`bg-video-fallback ${hidden || !videoReady ? "bg-video-fallback-visible" : ""}`}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          aria-hidden
        />
      </div>
      {mounted && createPortal(controls, document.body)}
    </>
  );
}
