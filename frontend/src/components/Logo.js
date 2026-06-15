/**
 * Sharago logo — renders the PNG wordmark + garage icon from /logo.png.
 * Uses a transparent crop of the artwork to fit any background.
 *
 * Three size variants. The wordmark is part of the PNG itself, so any text
 * carriers inside the layout no longer need a manual "Shar"+"ago" span.
 */
export default function Logo({ size = "md", showTagline = false, className = "" }) {
  const heights = {
    sm: "h-9",      // 36px — inline footers / breadcrumbs
    md: "h-12",     // 48px — desktop header (default)
    lg: "h-28",     // 112px — auth pages
    xl: "h-32",     // 128px — sidebar wide hero
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
