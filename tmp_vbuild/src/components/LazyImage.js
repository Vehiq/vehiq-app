import { useEffect, useRef, useState } from "react";

/**
 * Lazy-loaded image with shimmer skeleton.
 *
 * Behaviour:
 *  - Defers loading until the element nears the viewport (IntersectionObserver).
 *  - While the actual <img> is decoding, a shimmer skeleton covers it.
 *  - Skeleton fades out only after the browser fires `onLoad` for the image.
 *
 * Used for vehicle cover photos and listing thumbnails (often base64 data URLs).
 */
export default function LazyImage({
  src,
  alt = "",
  className = "",
  fallback = null,
  threshold = 0.05,
  rootMargin = "200px",
  eager = false,
  ...rest
}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(eager);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (eager || visible) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible(true);
            obs.disconnect();
          }
        });
      },
      { threshold, rootMargin }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [eager, visible, threshold, rootMargin]);

  // Reset loaded state whenever the src changes so the shimmer reappears.
  useEffect(() => {
    setLoaded(false);
  }, [src]);

  if (!src) return fallback;

  return (
    <div
      ref={ref}
      className={`${className} relative overflow-hidden`}
      data-testid="lazy-image"
      {...rest}
    >
      {visible && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          className={`w-full h-full object-cover transition-opacity duration-500 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
      {!loaded && (
        <div
          aria-hidden
          data-testid="lazy-image-skeleton"
          className="absolute inset-0 lazy-image-shimmer"
        />
      )}
    </div>
  );
}
