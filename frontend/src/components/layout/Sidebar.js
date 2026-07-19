import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Car, Store, MessagesSquare, Settings, LogOut, Mail, Wrench, Calendar,
  Key, Repeat,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";
import Logo from "@/components/Logo";

/**
 * Sidebar (Iter 52a — Change 25) — grouped nav (4 sections).
 *
 * GROUPS:
 *   🚗 GARAŻ         — Mój garaż
 *   🛒 MARKETPLACE   — Giełda, Wynajem, Zamiana, Usługi
 *   💬 SPOŁECZNOŚĆ   — Forum, Wydarzenia
 *   👤 KONTO         — Wiadomości (+badge), Ustawienia
 *
 * Removed: "Chętnie odkupię" (moved to a filter inside /marketplace) and
 * a top-level "Szukaj" entry (topbar already has a search icon).
 */

const GROUPS = [
  {
    key: "nav.groups.garage",
    Icon: Car,
    items: [
      { to: "/garage", key: "nav.garage", Icon: Car, testId: "sidebar-garage" },
    ],
  },
  {
    key: "nav.groups.marketplace",
    Icon: Store,
    items: [
      { to: "/marketplace", key: "nav.marketplace", Icon: Store, testId: "sidebar-marketplace" },
      { to: "/wynajem",     key: "nav.rentals",     Icon: Key,   testId: "sidebar-rentals" },
      { to: "/zamiany",     key: "nav.swaps",       Icon: Repeat, testId: "sidebar-swaps" },
      { to: "/services",    key: "nav.services",    Icon: Wrench, testId: "sidebar-services" },
    ],
  },
  {
    key: "nav.groups.community",
    Icon: MessagesSquare,
    items: [
      { to: "/forum",  key: "nav.forum",  Icon: MessagesSquare, testId: "sidebar-forum" },
      { to: "/events", key: "nav.events", Icon: Calendar,       testId: "sidebar-events" },
    ],
  },
  {
    key: "nav.groups.account",
    Icon: Settings,
    items: [
      { to: "/marketplace/messages", key: "nav.messages", Icon: Mail,     testId: "sidebar-messages", showBadge: true },
      { to: "/profile",              key: "nav.settings", Icon: Settings, testId: "sidebar-settings" },
    ],
  },
];

export default function Sidebar({ onNavigate, mobile = false }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    // Iter 41 — dedupe: skip a poll if the previous one is still in flight
    // OR fired less than 15s ago. Belt-and-suspenders against the recent
    // /marketplace/messages/threads storm even if some future component
    // remounts this Sidebar rapidly.
    let inFlight = false;
    let lastFetchAt = 0;
    let cancelled = false;
    const fetch = async () => {
      if (cancelled || inFlight) return;
      const now = Date.now();
      if (now - lastFetchAt < 15_000) return;
      inFlight = true;
      lastFetchAt = now;
      try {
        const r = await api.get("/marketplace/messages/threads");
        if (cancelled) return;
        const total = (r.data || []).reduce((s, tr) => s + (tr.unread || 0), 0);
        setUnread(total);
      } catch { /* silent — badge just stays stale */ }
      finally { inFlight = false; }
    };
    fetch();
    const i = setInterval(fetch, 30_000);
    return () => { cancelled = true; clearInterval(i); };
  }, [user]);

  return (
    <aside className={`${mobile ? "flex" : "hidden md:flex"} w-64 flex-col bg-vehiq-nav border-r border-vehiq-border min-h-screen sticky top-0`} data-testid="sidebar">
      <div className="p-4 border-b border-vehiq-border flex items-center justify-center">
        <Logo size="xl" />
      </div>

      <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
        {GROUPS.map((group) => {
          const GroupIcon = group.Icon;
          return (
            <div key={group.key} data-testid={`sidebar-group-${group.key.split(".").pop()}`}>
              <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-widest text-vehiq-muted">
                <GroupIcon size={12} className="text-vehiq-gold" />
                {t(group.key)}
              </div>
              <div className="space-y-0.5">
                {group.items.map(({ to, key, Icon, testId, showBadge }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={onNavigate}
                    data-testid={testId}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-colors ${
                        isActive
                          ? "bg-vehiq-gold-dim text-vehiq-gold"
                          : "text-vehiq-muted hover:text-vehiq-text hover:bg-vehiq-card"
                      }`
                    }
                  >
                    <Icon size={16} />
                    <span className="font-medium flex-1">{t(key)}</span>
                    {showBadge && unread > 0 && (
                      <span className="text-[10px] uppercase tracking-wider bg-vehiq-gold text-vehiq-bg rounded-full px-1.5 py-0.5 min-w-[18px] text-center" data-testid="messages-unread-badge">
                        {unread}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-vehiq-border">
        <button
          type="button"
          data-testid="sidebar-logout"
          onClick={() => { logout(); navigate("/login"); }}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-md text-sm text-vehiq-muted hover:text-vehiq-text hover:bg-vehiq-card transition-colors"
        >
          <LogOut size={18} />
          <span>{t("common.logout")}</span>
        </button>
      </div>
    </aside>
  );
}
