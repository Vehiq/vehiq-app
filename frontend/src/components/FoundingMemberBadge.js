/**
 * FoundingMemberBadge — small pill shown on public profiles / vehicle cards
 * for users who joined during the Founding 100 program.
 *
 * Two variants:
 *   - `compact`  → tiny chip (default), fits inline next to a user name.
 *   - `stacked`  → larger horizontal badge with subtitle, used on hero.
 */
export default function FoundingMemberBadge({ number, variant = "compact" }) {
  if (!number) return null;

  if (variant === "stacked") {
    return (
      <div
        className="inline-flex items-center gap-2 rounded-md border border-vehiq-gold/40 bg-vehiq-gold/10 px-3 py-1.5"
        data-testid="founding-badge-stacked"
      >
        <span className="text-base leading-none">⭐</span>
        <div className="leading-tight">
          <div className="text-xs font-semibold text-vehiq-gold">Founding Member</div>
          <div className="text-[10px] uppercase tracking-widest text-vehiq-muted">#{number} / 100</div>
        </div>
      </div>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-vehiq-gold/40 bg-vehiq-gold/10 px-2 py-0.5 text-[10px] font-medium text-vehiq-gold whitespace-nowrap"
      title={`Founding Member #${number}`}
      data-testid="founding-badge-compact"
    >
      <span className="text-[11px] leading-none">⭐</span>
      Founding #{number}
    </span>
  );
}
