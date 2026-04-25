import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Car, Store, MessagesSquare, User } from "lucide-react";

/**
 * Mobile bottom navigation — replaces sidebar on screens < md.
 * Touch targets are min 44x44px per Apple HIG.
 */
const ITEMS = [
  { to: "/garage", key: "nav.garage", Icon: Car, testid: "bottomnav-garage" },
  { to: "/marketplace", key: "nav.marketplace", Icon: Store, testid: "bottomnav-marketplace" },
  { to: "/forum", key: "nav.forum", Icon: MessagesSquare, testid: "bottomnav-forum" },
  { to: "/profile", key: "common.profile", Icon: User, testid: "bottomnav-profile" },
];

export default function BottomNav() {
  const { t } = useTranslation();
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-vehiq-nav/95 backdrop-blur border-t border-vehiq-border flex items-stretch justify-around"
      data-testid="bottom-nav"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0)" }}
    >
      {ITEMS.map(({ to, key, Icon, testid }) => (
        <NavLink
          key={to}
          to={to}
          data-testid={testid}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center min-h-[56px] py-1.5 text-[11px] gap-0.5 ${
              isActive ? "text-vehiq-gold" : "text-vehiq-muted"
            }`
          }
        >
          <Icon size={20} />
          <span>{t(key)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
