import { useEffect, useRef, useState } from "react";

/**
 * Lazy-loaded image. Uses IntersectionObserver to defer loading the actual src
 * until the element is near the viewport. Falls back to native loading=lazy.
 *
 * Intended for vehicle cover photos and listing thumbnails (often base64 data URLs).
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

  if (!src) return fallback;

  return (
    <div ref={ref} className={className.includes("absolute") ? className : `${className}`} {...rest}>
      {visible ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="w-full h-full object-cover transition-opacity duration-300"
        />
      ) : (
        <div className="w-full h-full bg-vehiq-nav animate-pulse" aria-hidden />
      )}
    </div>
  );
}
