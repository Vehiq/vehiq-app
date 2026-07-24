import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ArrowRight, ExternalLink } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

/**
 * B2B section on the profile page (Iter 55, Bug 34).
 *
 * When the user has no `business_id` → CTA to register a workshop/company.
 * When linked → shows the business name/type + shortcuts to the panel and
 * the public profile.
 */
export default function BusinessSection() {
  const { user } = useAuth();
  const [biz, setBiz] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!user?.business_id) { setBiz(null); return; }
    (async () => {
      try {
        // /business/access/list returns { business: {id, name, slug, activated} }
        const { data } = await api.get("/business/access/list");
        if (alive) setBiz(data.business);
      } catch { if (alive) setBiz(null); }
    })();
    return () => { alive = false; };
  }, [user?.business_id]);

  if (!user) return null;

  if (!user.business_id) {
    return (
      <div className="vehiq-card p-6 space-y-4" data-testid="profile-business-empty">
        <div className="vehiq-overline inline-flex items-center gap-2">
          <Building2 size={12} /> Firma
        </div>
        <div className="space-y-2">
          <h3 className="text-lg text-vehiq-text font-medium">Prowadzisz firmę motoryzacyjną?</h3>
          <p className="text-sm text-vehiq-muted">
            Zarejestruj warsztat, komis, detailing lub inną firmę i zyskaj publiczny profil w Sharago —
            widoczność w wyszukiwarce, panel B2B i historię serwisową klientów.
          </p>
        </div>
        <Link
          to="/register/business"
          className="inline-flex items-center gap-2 vehiq-btn-primary text-sm px-4 py-2"
          data-testid="profile-business-register-cta"
        >
          Zarejestruj firmę <ArrowRight size={14} />
        </Link>
      </div>
    );
  }

  return (
    <div className="vehiq-card p-6 space-y-4" data-testid="profile-business-linked">
      <div className="vehiq-overline inline-flex items-center gap-2">
        <Building2 size={12} /> Twoja firma
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg text-vehiq-text font-medium" data-testid="profile-business-name">
            {biz?.name || "…"}
          </h3>
          <div className="text-xs text-vehiq-muted mt-1">
            {biz?.activated ? (
              <span className="text-emerald-400">● Aktywne</span>
            ) : (
              <span className="text-amber-400">● Oczekuje aktywacji (zeskanuj pierwsze QR)</span>
            )}
            {user.business_role && <span> · rola: {user.business_role}</span>}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <Link
            to="/business/dashboard"
            className="vehiq-btn-primary text-xs px-3 py-1.5 whitespace-nowrap"
            data-testid="profile-business-dashboard"
          >
            Panel warsztatu →
          </Link>
          {biz?.slug && (
            <Link
              to={`/warsztaty/${biz.slug}`}
              className="vehiq-btn-secondary text-xs px-3 py-1.5 whitespace-nowrap inline-flex items-center gap-1"
              data-testid="profile-business-public"
            >
              <ExternalLink size={11} /> Profil publiczny
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
