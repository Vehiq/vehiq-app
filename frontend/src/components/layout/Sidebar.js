import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Car, Store, MessagesSquare, Settings, LogOut, Mail, Search, Wrench, Calendar, Key } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";
import Logo from "@/components/Logo";

const NAV = [
  { to: "/garage", key: "nav.garage", Icon: Car, testId: "sidebar-garage" },
  { to: "/marketplace", key: "nav.marketplace", Icon: Store, testId: "sidebar-marketplace" },
  { to: "/wynajem", key: "nav.rentals", Icon: Key, testId: "sidebar-rentals" },
  { to: "/marketplace/messages", key: "nav.messages", Icon: Mail, testId: "sidebar-messages", showBadge: true },
  { to: "/services", key: "nav.services", Icon: Wrench, testId: "sidebar-services" },
  { to: "/events", key: "nav.events", Icon: Calendar, testId: "sidebar-events" },
  { to: "/forum", key: "nav.forum", Icon: MessagesSquare, testId: "sidebar-forum" },
  { to: "/search", key: "nav.search", Icon: Search, testId: "sidebar-search" },
  { to: "/profile", key: "nav.settings", Icon: Settings, testId: "sidebar-settings" },
];

export default function Sidebar({ onNavigate, mobile = false }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      try {
        const r = await api.get("/marketplace/messages/threads");
        const total = (r.data || []).reduce((s, t) => s + (t.unread || 0), 0);
        setUnread(total);
      } catch {}
    };
    fetch();
    const i = setInterval(fetch, 30000);
    return () => clearInterval(i);
  }, [user]);

  return (
    <aside className={`${mobile ? "flex" : "hidden md:flex"} w-64 flex-col bg-vehiq-nav border-r border-vehiq-border min-h-screen sticky top-0`} data-testid="sidebar">
      <div className="p-4 border-b border-vehiq-border flex items-center justify-center">
        <Logo size="xl" />
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {NAV.map(({ to, key, Icon, testId, showBadge }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            data-testid={testId}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-vehiq-gold-dim text-vehiq-gold"
                  : "text-vehiq-muted hover:text-vehiq-text hover:bg-vehiq-card"
              }`
            }
          >
            <Icon size={18} />
            <span className="font-medium flex-1">{t(key)}</span>
            {showBadge && unread > 0 && (
              <span className="text-[10px] uppercase tracking-wider bg-vehiq-gold text-vehiq-bg rounded-full px-1.5 py-0.5 min-w-[18px] text-center" data-testid="messages-unread-badge">
                {unread}
              </span>
            )}
          </NavLink>
        ))}
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
