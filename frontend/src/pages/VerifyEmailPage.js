import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MailCheck, XCircle } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const { user, refresh } = useAuth();
  const [state, setState] = useState("checking");
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return; // StrictMode double-invoke: send only once
    sent.current = true;
    const token = params.get("token");
    if (!token) { setState("bad"); return; }
    api.post("/auth/verify-email", { token }, { timeout: 15000 })
      .then(() => { setState("ok"); refresh?.(); })
      .catch(() => setState("bad"));
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps
  const Icon = state === "bad" ? XCircle : MailCheck;
  return (
    <div className="min-h-screen flex items-center justify-center bg-vehiq-bg text-center px-4" data-testid={`verify-page-${state}`}>
      <div>
        <Icon size={44} className="mx-auto text-vehiq-gold/70" />
        <h1 className="vehiq-display text-3xl text-vehiq-text mt-4">{t(`verify.${state}`)}</h1>
        {state !== "checking" && <Link to={user ? "/garage" : "/login"} className="vehiq-btn-primary inline-block mt-6" data-testid="verify-page-continue">{t("verify.toGarage")}</Link>}
      </div>
    </div>
  );
}
