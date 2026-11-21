/**
 * Sharago logo — renders the PNG wordmark + garage icon from /logo.png.
 * Uses a transparent crop of the artwork to fit any background.
 *
 * Three size variants. The wordmark is part of the PNG itself, so any text
 * carriers inside the layout no longer need a manual "Shar"+"ago" span.
 */
export default function Logo({ size = "md", showTagline = false, className = "" }) {
  const heights = {
    sm: "h-9",                  // 36px — inline footers / breadcrumbs
    md: "h-12 md:h-14",         // 48/56px — desktop header (default)
    lg: "h-20 md:h-24",         // 80/96px — auth pages (Iter 38)
    xl: "h-24 md:h-32",         // 96/128px — sidebar wide hero (Iter 38)
  };
  return (
    <div className={`inline-flex items-center gap-2 ${className}`} data-testid="sharago-logo">
      <img
        src="/logo.png"
        alt="Sharago"
        className={`${heights[size] || heights.md} w-auto object-contain select-none`}
        draggable="false"
      />
      {showTagline && (
        <div className="hidden sm:block leading-tight">
          <div className="text-[10px] uppercase tracking-[0.3em] text-vehiq-muted">
            Wirtualny Garaż
          </div>
        </div>
      )}
    </div>
  );
}
