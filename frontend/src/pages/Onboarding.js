import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Car, Sparkles, ArrowRight } from "lucide-react";

export default function Onboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  return (
    <div className="min-h-screen bg-vehiq-bg flex flex-col" data-testid="onboarding">
      <div className="flex justify-end p-6"><LanguageSwitcher /></div>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="vehiq-card p-8 md:p-12 max-w-xl w-full text-center">
          {step === 1 && (
            <>
              <div className="inline-flex h-14 w-14 rounded-full bg-vehiq-gold-dim items-center justify-center text-vehiq-gold mb-3"><Sparkles size={28}/></div>
              <h1 className="vehiq-display text-4xl text-vehiq-text">{t("onboarding.step1Title")}</h1>
              <p className="text-vehiq-muted mt-3">{t("onboarding.step1Desc")}</p>
              <button onClick={() => setStep(2)} className="vehiq-btn-primary mt-8 inline-flex items-center gap-2" data-testid="onboarding-next-1">{t("common.next")} <ArrowRight size={14}/></button>
            </>
          )}
          {step === 2 && (
            <>
              <div className="inline-flex h-14 w-14 rounded-full bg-vehiq-gold-dim items-center justify-center text-vehiq-gold mb-3"><Car size={28}/></div>
              <h1 className="vehiq-display text-4xl text-vehiq-text">{t("onboarding.step2Title")}</h1>
              <p className="text-vehiq-muted mt-3">{t("onboarding.step2Desc")}</p>
              <div className="mt-8 flex gap-3 justify-center">
                <button onClick={() => navigate("/garage")} className="vehiq-btn-secondary" data-testid="onboarding-skip">{t("onboarding.skip")}</button>
                <button onClick={() => navigate("/garage/new")} className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="onboarding-add">{t("garage.addVehicle")} <ArrowRight size={14}/></button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
