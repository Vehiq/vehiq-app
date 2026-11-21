import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Car, Wrench, Store, MessagesSquare, X } from "lucide-react";

/**
 * Floating Action Button — quick add menu for vehicles, service entries,
 * listings and forum threads. Hidden on mobile when bottom nav is visible.
 */
export default function FAB() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (open && ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Hide on auth/admin/onboarding pages
  if (
    location.pathname.startsWith("/gv91-admin") ||
    location.pathname === "/onboarding" ||
    location.pathname === "/login" ||
    location.pathname === "/register"
  ) return null;

  const items = [
    { Icon: Car, label: t("fab.addVehicle"), onClick: () => navigate("/garage/new"), testid: "fab-add-vehicle" },
    { Icon: Wrench, label: t("fab.addService"), onClick: () => navigate("/garage"), testid: "fab-add-service" },
    { Icon: Store, label: t("fab.addListing"), onClick: () => navigate("/marketplace/new"), testid: "fab-add-listing" },
    { Icon: MessagesSquare, label: t("fab.newThread"), onClick: () => navigate("/forum/new"), testid: "fab-new-thread" },
  ];

  return (
    <div ref={ref} className="fixed right-4 z-30 flex flex-col items-end gap-2 bottom-20 md:bottom-6" data-testid="dashboard-fab">
      {open && (
        <div className="flex flex-col items-end gap-2 mb-1 animate-fade-in">
          {items.map(({ Icon, label, onClick, testid }) => (
            <button
              key={testid}
              data-testid={testid}
              onClick={() => { onClick(); setOpen(false); }}
              className="flex items-center gap-3 bg-vehiq-card border border-vehiq-border hover:border-vehiq-gold text-vehiq-text rounded-full pl-4 pr-2 py-1.5 shadow-lg transition-colors"
            >
              <span className="text-sm">{label}</span>
              <span className="h-8 w-8 rounded-full bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center"><Icon size={14}/></span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-label="Quick actions"
        data-testid="dashboard-fab-btn"
        className={`h-14 w-14 rounded-full bg-vehiq-gold text-vehiq-bg shadow-xl flex items-center justify-center transition-transform ${open ? "rotate-45" : ""} hover:bg-vehiq-gold-hover`}
      >
        <Plus size={24} />
      </button>
    </div>
  );
}
