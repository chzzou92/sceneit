"use client";
import React, { useEffect, useRef } from "react";

type Marker = { label: string; t: number }; // seconds

type Props = {
  src: string;               // S3 public URL or presigned GET URL
  startAt?: number;          // optional initial time (seconds)
  markers?: Marker[];        // optional jump points (shots/frames)
  className?: string;
};

export default function VideoPlayer({ src, startAt = 0, markers = [], className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Seek to startAt once metadata is loaded (duration known)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => {
      if (startAt > 0) {
        v.currentTime = startAt;
      }
    };
    v.addEventListener("loadedmetadata", onLoaded);
    return () => v.removeEventListener("loadedmetadata", onLoaded);
  }, [startAt]);

  // Optional: support deep-link ?t=123
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const url = new URL(window.location.href);
    const tParam = url.searchParams.get("t");
    if (tParam) {
      const t = parseFloat(tParam);
      if (!Number.isNaN(t)) {
        const onLoaded = () => { v.currentTime = t; };
        v.addEventListener("loadedmetadata", onLoaded, { once: true });
      }
    }
  }, []);

  const jumpTo = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, t);
    v.play().catch(() => {}); // ignore autoplay restrictions
  };

  return (
    <div className={className}>
      <video
        ref={videoRef}
        src={src}
        controls
        preload="metadata"
        playsInline
        crossOrigin="anonymous" // helpful if you’ll draw frames to <canvas> later
        style={{ width: "100%", borderRadius: 8 }}
      />
      {markers.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {markers.map((m, i) => (
            <button key={i} onClick={() => jumpTo(m.t)} style={{ padding: "6px 10px" }}>
              {m.label} ({m.t.toFixed(1)}s)
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
