/**
 * Sharago wordmark — "Shar" in light/white, "ago" in amber gold (#F59E0B).
 * Use everywhere a text logo is rendered. Accepts a size variant for layout.
 */
export default function Logo({ size = "md", showTagline = false, className = "" }) {
  const sizes = {
    sm: { box: "h-7 w-7 text-base", word: "text-lg" },
    md: { box: "h-10 w-10 text-lg", word: "text-2xl" },
    lg: { box: "h-12 w-12 text-2xl", word: "text-3xl" },
    xl: { box: "h-14 w-14 text-3xl", word: "text-4xl" },
  }[size] || { box: "h-10 w-10 text-lg", word: "text-2xl" };

  return (
    <div className={`inline-flex items-center gap-2 ${className}`} data-testid="sharago-logo">
      <div
        className={`${sizes.box} rounded-md bg-vehiq-gold flex items-center justify-center text-vehiq-bg font-bold`}
        aria-hidden="true"
      >
        S
      </div>
      <div className="leading-none">
        <div className={`vehiq-display tracking-wider ${sizes.word}`}>
          <span className="text-vehiq-text">Shar</span>
          <span style={{ color: "#F59E0B" }}>ago</span>
        </div>
        {showTagline && (
          <div className="text-[10px] uppercase tracking-[0.25em] text-vehiq-gold mt-1">
            Platforma motoryzacyjna
          </div>
        )}
      </div>
    </div>
  );
}
