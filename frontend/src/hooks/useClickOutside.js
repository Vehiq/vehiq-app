import { useEffect } from "react";

/**
 * Close-on-outside-click hook (Iter 40).
 *
 * Attaches a `mousedown` listener to the document that invokes `onClose()`
 * whenever the click target is outside the referenced element. Also handles
 * the Escape key so keyboard users can dismiss dropdowns without touching
 * the mouse.
 *
 * Usage:
 *   const ref = useRef(null);
 *   useClickOutside(ref, () => setOpen(false), open);
 *
 * The third `enabled` arg is optional — pass the dropdown's open flag so we
 * only listen while it's visible (avoids background overhead on every page).
 */
export default function useClickOutside(ref, onClose, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const handleClick = (e) => {
      const el = ref?.current;
      if (!el) return;
      if (!el.contains(e.target)) onClose?.();
    };
    const handleKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick, { passive: true });
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [ref, onClose, enabled]);
}
