// Sharago logo: garage mark + "Sharago" wordmark side by side, tight crops of /logo.png at 5x (sharp on Retina).
const SIZES = {
  sm: { mark: "h-9", word: "h-[18px]" },         // 36px — footers
  md: { mark: "h-10", word: "h-5" },             // 40px — headers (desktop + mobile)
  lg: { mark: "h-12", word: "h-6" },             // 48px — auth pages
  xl: { mark: "h-12", word: "h-6" },             // 48px — sidebar
};

export default function Logo({ size = "md", variant = "full", className = "" }) {
  const s = SIZES[size] || SIZES.md;
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`} data-testid="sharago-logo">
      <img src="/logo-mark.png" alt={variant === "mark" ? "Sharago" : ""} className={`${s.mark} w-auto object-contain`} draggable="false" />
      {variant !== "mark" && (
        <img src="/logo-wordmark.png" alt="Sharago" className={`${s.word} w-auto object-contain`} draggable="false" />
      )}
    </div>
  );
}
