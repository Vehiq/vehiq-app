import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Car, Wrench, Store, MessagesSquare, Sparkles, Settings, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const NAV = [
  { to: "/garage", key: "nav.garage", Icon: Car, testId: "sidebar-garage" },
  { to: "/marketplace", key: "nav.marketplace", Icon: Store, testId: "sidebar-marketplace" },
  { to: "/forum", key: "nav.forum", Icon: MessagesSquare, testId: "sidebar-forum" },
  { to: "/profile", key: "nav.settings", Icon: Settings, testId: "sidebar-settings" },
];

export default function Sidebar({ onNavigate }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <aside className="hidden md:flex w-64 flex-col bg-vehiq-nav border-r border-vehiq-border min-h-screen sticky top-0" data-testid="sidebar">
      <div className="p-6 border-b border-vehiq-border">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-md bg-vehiq-gold flex items-center justify-center text-vehiq-bg font-bold text-lg">V</div>
          <div>
            <div className="vehiq-display text-2xl tracking-wide text-vehiq-text leading-none">VEHIQ</div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-vehiq-gold mt-1">Virtual Garage</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {NAV.map(({ to, key, Icon, testId }) => (
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
            <span className="font-medium">{t(key)}</span>
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
