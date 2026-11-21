/**
 * EmptyState — uniform, on-brand empty state with icon + CTA.
 */
export default function EmptyState({ icon: Icon, title, description, action, dataTestId = "empty-state" }) {
  return (
    <div className="vehiq-card p-10 md:p-14 text-center" data-testid={dataTestId}>
      {Icon && (
        <div className="mx-auto h-16 w-16 rounded-full bg-vehiq-gold-dim flex items-center justify-center mb-4">
          <Icon size={28} className="text-vehiq-gold" />
        </div>
      )}
      <h2 className="vehiq-display text-3xl text-vehiq-text">{title}</h2>
      {description && <p className="text-vehiq-muted mt-2 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
