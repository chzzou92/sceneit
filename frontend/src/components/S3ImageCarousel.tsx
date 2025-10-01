import React, {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  SetStateAction,
} from "react";

type S3CarouselProps = {
  /** List of S3 image URIs (e.g., "https://bucket.s3.amazonaws.com/path.jpg") */
  urls: string[];
  /** How many images visible at once */
  visible?: number; // default 3
  /** Fixed height in px for the carousel (images are object-cover) */
  height?: number; // default 200
  /** Optional rounded style class (e.g., "rounded-xl") if you use Tailwind */
  roundedClassName?: string;
  urlStartPoints: number[];
  setStartPoint: React.Dispatch<React.SetStateAction<number>>;
};

const clamp = (val: number, min: number, max: number) =>
  Math.max(min, Math.min(max, val));

const S3ImageCarousel: React.FC<S3CarouselProps> = ({
  urls,
  visible = 3,
  height = 180,
  roundedClassName = "rounded-lg",
  setStartPoint,
  urlStartPoints,
}) => {
  const [start, setStart] = useState(0); // index of first visible item
  const maxStart = Math.max(0, urls.length - visible);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const itemBasis = useMemo(() => `${100 / visible}%`, [visible]);
  const canPrev = start > 0;
  const canNext = start < maxStart;

  const goPrev = useCallback(
    () => setStart((s) => clamp(s - 1, 0, maxStart)),
    [maxStart]
  );
  const goNext = useCallback(
    () => setStart((s) => clamp(s + 1, 0, maxStart)),
    [maxStart]
  );

  // Reset to first image whenever the list of URLs changes
  useEffect(() => {
    setStart(0);
  }, [urls]);

  // Keyboard support (Left/Right arrows)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext]);

  // Prevent image drag ghosting
  const preventDrag = (e: React.DragEvent) => e.preventDefault();

  return (
    <div className="relative w-full select-none z-100" style={{ height }}>
      {/* Viewport */}
      <div className="h-full w-full overflow-hidden">
        {/* Track */}
        <div
          ref={trackRef}
          className="flex h-full transition-transform duration-300 ease-out"
          style={{
            transform: `translateX(-${(start * 100) / visible}%)`,
          }}
          aria-live="polite"
        >
          {urls.map((src, i) => {
            const alt = src.split("/").pop() || `image-${i + 1}`;
            return (
              <div
                key={src + i}
                className="h-full p-3"
                style={{ flex: `0 0 ${itemBasis}` }}
              >
                <div
                  className={`
      group relative h-full w-full ${roundedClassName} 
      transition duration-300 ease-out will-change-transform
      hover:scale-[1.02]
      hover:shadow-[0_0_28px_8px_rgba(59,130,246,0.55)]
      hover:ring-2 hover:ring-[rgb(59_130_246)] hover:ring-offset-2 hover:ring-offset-black/60
    `}
                  onClick={() => setStartPoint(urlStartPoints[i])}
                >
                  <img
                    src={src}
                    alt={alt}
                    draggable={false}
                    onDragStart={preventDrag}
                    className={`h-full w-full object-cover ${roundedClassName} block`}
                    loading="lazy"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <button
        type="button"
        onClick={goPrev}
        disabled={!canPrev}
        aria-label="Previous images"
        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white px-3 py-2 rounded-full disabled:opacity-40 
        disabled:cursor-not-allowed hover:scale-[1.02]
        hover:shadow-[0_0_28px_8px_rgba(59,130,246,0.55)]
        hover:ring-2 hover:ring-[rgb(59_130_246)] hover:ring-offset-2 hover:ring-offset-black/60 transition duration-300 ease-out will-change-transform"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={goNext}
        disabled={!canNext}
        aria-label="Next images"
        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white px-3 py-2 rounded-full disabled:opacity-40 disabled:cursor-not-allowed
        hover:shadow-[0_0_28px_8px_rgba(59,130,246,0.55)]
        hover:ring-2 hover:ring-[rgb(59_130_246)] hover:ring-offset-2 hover:ring-offset-black/60 transition duration-300 ease-out will-change-transform"
      >
        ›
      </button>

      {/* Dots (optional) */}
      {urls.length > visible && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
          {Array.from({ length: maxStart + 1 }).map((_, idx) => (
            <button
              key={idx}
              aria-label={`Go to set ${idx + 1}`}
              onClick={() => setStart(idx)}
              className={`h-2.5 w-2.5 rounded-full ${
                idx === start ? "bg-white" : "bg-white/50"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default S3ImageCarousel;
