import { useState, useEffect } from "react";
import { Bell, Search, Menu, User as UserIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";

export default function TopBar({ onMenu }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState({ vehicles: [], listings: [], threads: [] });
  const [profileOpen, setProfileOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);

  useEffect(() => {
    let active = true;
    if (q.length >= 2) {
      api.get(`/notifications/global-search`, { params: { q } }).then((r) => active && setResults(r.data));
    } else {
      setResults({ vehicles: [], listings: [], threads: [] });
    }
    return () => { active = false; };
  }, [q]);

  useEffect(() => {
    if (user) api.get("/notifications").then((r) => setNotifs(r.data || []));
  }, [user]);

  return (
    <header className="sticky top-0 z-30 bg-vehiq-bg/95 backdrop-blur border-b border-vehiq-border" data-testid="topbar">
      <div className="flex items-center gap-3 px-4 md:px-6 py-3">
        <button type="button" onClick={onMenu} className="md:hidden p-2 rounded-md text-vehiq-text hover:bg-vehiq-card" data-testid="topbar-menu">
          <Menu size={20} />
        </button>

        <div className="flex-1 flex items-center gap-2 max-w-xl">
          <div className="relative w-full">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-vehiq-muted" />
            <input
              data-testid="global-search-input"
              type="text"
              placeholder={t("nav.search")}
              value={q}
              onChange={(e) => { setQ(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
              className="w-full bg-vehiq-card border border-vehiq-border text-vehiq-text rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-vehiq-gold"
            />
            {searchOpen && q.length >= 2 && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-vehiq-card border border-vehiq-border rounded-md shadow-lg overflow-hidden z-40">
                {results.vehicles.length === 0 && results.listings.length === 0 && results.threads.length === 0 ? (
                  <div className="p-3 text-sm text-vehiq-muted">{t("common.noResults")}</div>
                ) : (
                  <>
                    {results.vehicles.length > 0 && (
                      <div className="p-2">
                        <div className="vehiq-overline px-2 py-1">{t("nav.garage")}</div>
                        {results.vehicles.map(v => (
                          <button key={v.id} onClick={() => { navigate(`/garage/${v.id}`); setSearchOpen(false); setQ(""); }} className="w-full text-left px-2 py-2 text-sm text-vehiq-text hover:bg-vehiq-gold-dim rounded">
                            {v.make} {v.model} {v.year || ""}
                          </button>
                        ))}
                      </div>
                    )}
                    {results.listings.length > 0 && (
                      <div className="p-2 border-t border-vehiq-border">
                        <div className="vehiq-overline px-2 py-1">{t("nav.marketplace")}</div>
                        {results.listings.map(l => (
                          <button key={l.id} onClick={() => { navigate(`/marketplace/${l.id}`); setSearchOpen(false); setQ(""); }} className="w-full text-left px-2 py-2 text-sm text-vehiq-text hover:bg-vehiq-gold-dim rounded">
                            {l.title} — <span className="text-vehiq-gold">{l.price} PLN</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {results.threads.length > 0 && (
                      <div className="p-2 border-t border-vehiq-border">
                        <div className="vehiq-overline px-2 py-1">{t("nav.forum")}</div>
                        {results.threads.map(thr => (
                          <button key={thr.id} onClick={() => { navigate(`/forum/${thr.id}`); setSearchOpen(false); setQ(""); }} className="w-full text-left px-2 py-2 text-sm text-vehiq-text hover:bg-vehiq-gold-dim rounded">
                            {thr.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          <LanguageSwitcher />

          <div className="relative">
            <button type="button" onClick={() => setBellOpen((s) => !s)} className="relative p-2 rounded-md text-vehiq-text hover:bg-vehiq-card" data-testid="notifications-bell">
              <Bell size={18} />
              {notifs.length > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-vehiq-gold text-vehiq-bg text-[10px] font-bold flex items-center justify-center" data-testid="notification-badge">
                  {notifs.length}
                </span>
              )}
            </button>
            {bellOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-auto bg-vehiq-card border border-vehiq-border rounded-md shadow-lg z-50" data-testid="notifications-dropdown">
                <div className="p-3 border-b border-vehiq-border vehiq-overline">{t("nav.notifications")}</div>
                {notifs.length === 0 ? (
                  <div className="p-4 text-sm text-vehiq-muted">{t("common.noResults")}</div>
                ) : notifs.map((n, i) => {
                  // Localized title; backend `n.title` kept as fallback for legacy clients
                  let title = n.title;
                  if (n.type === "reminder") {
                    const subtype = t(`notifications.reminderTypes.${n.reminder_type || "default"}`, { defaultValue: n.reminder_type || t("notifications.reminderTypes.default") });
                    title = t("notifications.reminder", { type: subtype });
                  } else if (n.type === "messages") {
                    title = t("notifications.messages", { count: n.count, defaultValue: n.title });
                  }
                  return (
                    <div key={i} className="p-3 border-b border-vehiq-border text-sm text-vehiq-text" data-testid={`notif-item-${i}`}>
                      <div className="font-medium">{title}</div>
                      {n.date && <div className="text-xs text-vehiq-muted mt-1">{n.date}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="relative">
            <button type="button" onClick={() => setProfileOpen((s) => !s)} className="flex items-center gap-2 p-1 rounded-md hover:bg-vehiq-card" data-testid="topbar-profile">
              {user?.avatar ? (
                <img src={user.avatar} alt="" className="h-8 w-8 rounded-full object-cover border border-vehiq-border" />
              ) : (
                <div className="h-8 w-8 rounded-full bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center">
                  <UserIcon size={16} />
                </div>
              )}
              <span className="hidden md:inline text-sm text-vehiq-text">{user?.name?.split(" ")[0]}</span>
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-44 bg-vehiq-card border border-vehiq-border rounded-md shadow-lg z-50">
                <button onClick={() => { setProfileOpen(false); navigate("/profile"); }} className="w-full text-left px-3 py-2 text-sm text-vehiq-text hover:bg-vehiq-gold-dim" data-testid="profile-menu-profile">{t("common.profile")}</button>
                <button onClick={() => { setProfileOpen(false); logout(); navigate("/login"); }} className="w-full text-left px-3 py-2 text-sm text-vehiq-text hover:bg-vehiq-gold-dim" data-testid="profile-menu-logout">{t("common.logout")}</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
