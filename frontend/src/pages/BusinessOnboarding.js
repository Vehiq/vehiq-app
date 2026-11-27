import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import BusinessProfileForm from "@/components/BusinessProfileForm";

// Paczka 12: onboarding uses the same profile form as the dashboard "Profil" tab.
export default function BusinessOnboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [biz, setBiz] = useState(null);
  useEffect(() => {
    api.get("/business/access/list").then((r) => setBiz(r.data.business)).catch(() => navigate("/register/business", { replace: true }));
  }, [navigate]);
  if (!biz) return <div className="p-8 text-vehiq-muted" data-testid="business-onboarding-loading">…</div>;
  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-6 py-6 space-y-5" data-testid="business-onboarding">
      <h1 className="vehiq-display text-3xl sm:text-4xl break-words">{biz.name}</h1>
      <div className="vehiq-card p-4 sm:p-6"><BusinessProfileForm biz={biz} onSaved={setBiz} /></div>
      <Link to="/business/dashboard" className="vehiq-btn-secondary inline-flex px-4 py-2 text-sm" data-testid="onboarding-to-dashboard">{t("bizp.form.toDashboard")}</Link>
    </div>
  );
}
