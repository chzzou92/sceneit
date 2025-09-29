"use client";
import React, { useEffect, useRef, memo } from "react";

type Props = {
  src: string;         // presigned GET or public URL
  startAt?: number;    // seconds; can change often
  autoPlayOnSeek?: boolean;
  className?: string;
};

function VideoPlayerBase({ src, startAt = 0, autoPlayOnSeek = false, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // set src once; changing src will reload the media
  // (if src changes, we’ll seek after metadata loads below)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.src = src;
  }, [src]);

  // seek when startAt changes (without re-mounting the video)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const applySeek = () => {
      if (Number.isFinite(startAt) && startAt >= 0 && v.duration) {
        v.currentTime = Math.min(startAt, v.duration - 0.001);
        if (autoPlayOnSeek) {
          v.play().catch(() => {/* ignore autoplay block */});
        }
      }
    };

    // If metadata already known, seek immediately; else wait once
    if (v.readyState >= 1) {
      applySeek();
    } else {
      const once = () => { applySeek(); v.removeEventListener("loadedmetadata", once); };
      v.addEventListener("loadedmetadata", once);
      return () => v.removeEventListener("loadedmetadata", once);
    }
  }, [startAt, autoPlayOnSeek]);

  return (
    <video
      ref={videoRef}
      controls
      preload="metadata"
      playsInline
      style={{ width: "100%", borderRadius: 8 }}
      // keep crossOrigin if you plan to draw frames to canvas
      crossOrigin="anonymous"
      className={className}
    />
  );
}

// Optional: avoid unnecessary child re-renders when parent state changes unrelated to props
const VideoPlayer = memo(VideoPlayerBase);
export default VideoPlayer;
