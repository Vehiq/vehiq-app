import { useEffect, useState } from "react";
import { AlertTriangle, Clock, Wrench } from "lucide-react";
import api from "@/lib/api";

/**
 * Service reminders widget — Iter 39.
 *
 * Reads `reminders[]` from GET /api/service/stats/{vehicle_id}. Backend emits
 * only entries whose status is "overdue" or "due_soon" (rules in
 * REMINDER_RULES on the server). Hidden entirely when there is nothing to
 * remind about — the widget must not add empty-state noise to the dashboard.
 */
export default function ServiceReminders({ vehicleId }) {
  const [reminders, setReminders] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await api.get(`/service/stats/${vehicleId}`);
        if (mounted) setReminders(data.reminders || []);
      } catch {
        if (mounted) setReminders([]);
      }
    })();
    return () => { mounted = false; };
  }, [vehicleId]);

  if (!reminders || reminders.length === 0) return null;

  return (
    <div className="vehiq-card p-5 border-l-2 border-l-vehiq-gold/70" data-testid="service-reminders">
      <div className="flex items-center gap-2 mb-3">
        <Wrench size={16} className="text-vehiq-gold" />
        <div className="vehiq-overline">Przypomnienia serwisowe</div>
      </div>
      <div className="space-y-2">
        {reminders.map((r) => (
          <ReminderItem key={r.service_type} r={r} />
        ))}
      </div>
    </div>
  );
}

function ReminderItem({ r }) {
  const isOverdue = r.status === "overdue";
  const badgeCls = isOverdue
    ? "bg-red-500/15 text-red-400 border-red-500/30"
    : "bg-vehiq-gold-dim text-vehiq-gold border-vehiq-gold/30";
  const badgeLabel = isOverdue ? "Zaległy" : "Wkrótce";
  const Icon = isOverdue ? AlertTriangle : Clock;
  return (
    <div
      className="flex items-start gap-3 p-2 rounded hover:bg-vehiq-gold-dim/30 transition-colors"
      data-testid={`reminder-${r.service_type}`}
    >
      <Icon size={16} className={isOverdue ? "text-red-400 mt-0.5" : "text-vehiq-gold mt-0.5"} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-vehiq-text">{r.label}</span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${badgeCls}`}
            data-testid={`reminder-badge-${r.service_type}`}
          >
            {badgeLabel}
          </span>
        </div>
        {r.message && (
          <p className="text-xs text-vehiq-muted mt-0.5">{r.message}</p>
        )}
        {r.last_date && (
          <p className="text-[10px] text-vehiq-muted/70 mt-0.5">
            Ostatnia usługa: {String(r.last_date).slice(0, 10)}
          </p>
        )}
      </div>
    </div>
  );
}
