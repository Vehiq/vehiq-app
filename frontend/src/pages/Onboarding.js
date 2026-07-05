import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import Logo from "@/components/Logo";
import Confetti from "@/components/Confetti";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";
import { toast } from "sonner";
import { Car, Wrench, Sparkles, Store, ArrowRight, ArrowLeft, Upload, CheckCircle2, X } from "lucide-react";

const POPULAR_MAKES = ["Audi", "BMW", "Mercedes-Benz", "Porsche", "Volkswagen", "Toyota", "Honda", "Ford", "Mazda", "Volvo", "Skoda", "Tesla", "Lexus", "Land Rover"];

export default function Onboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { updateProfile } = useAuth();

  // 0 = welcome screen, 1..3 = wizard steps, 4 = success
  const [stage, setStage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [savedVehicle, setSavedVehicle] = useState(null);
  const [form, setForm] = useState({
    make: "",
    model: "",
    year: "",
    photos: [],
    mileage_current: "",
    purchase_date: "",
  });

  const markOnboarded = async () => {
    try { await updateProfile({ onboarded: true }); } catch {}
  };

  const skipAll = async () => {
    await markOnboarded();
    navigate("/garage");
  };

  const handlePhoto = async (e) => {
    const file = (e.target.files || [])[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { toast.error("Max 15MB"); return; }
    // Iter 44: compress before base64 encoding to stay under the inline photo guard.
    const { compressImage, fileToDataURL } = await import("@/lib/imageCompress");
    let compressed;
    try {
      compressed = await compressImage(file);
    } catch {
      compressed = file;
    }
    const dataUrl = await fileToDataURL(compressed);
    setForm((f) => ({ ...f, photos: [dataUrl] }));
  };

  const submitVehicle = async () => {
    if (!form.make.trim() || !form.model.trim()) {
      toast.error(t("onboarding.makeModelRequired"));
      setStage(1);
      return;
    }
    setBusy(true);
    try {
      const payload = {
        make: form.make.trim(),
        model: form.model.trim(),
        year: form.year ? parseInt(form.year) : null,
        photos: form.photos,
        cover_photo_index: 0,
        mileage_current: form.mileage_current ? parseInt(form.mileage_current) : 0,
        purchase_date: form.purchase_date || null,
        status: "active",
        fuel: "petrol",
      };
      const { data } = await api.post("/vehicles", payload);
      setSavedVehicle(data);
      await markOnboarded();
      setStage(4);
    } catch (e) {
      toast.error(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-vehiq-bg flex flex-col" data-testid="onboarding">
      <div className="flex justify-end p-6"><LanguageSwitcher /></div>

      <div className="flex-1 flex items-center justify-center px-4 pb-10">
        {stage === 0 && <WelcomeScreen onAdd={() => setStage(1)} onSkip={skipAll} t={t} />}

        {stage >= 1 && stage <= 3 && (
          <WizardCard
            stage={stage}
            setStage={setStage}
            form={form}
            setForm={setForm}
            handlePhoto={handlePhoto}
            submitVehicle={submitVehicle}
            busy={busy}
            t={t}
          />
        )}

        {stage === 4 && savedVehicle && (
          <>
            <Confetti active duration={2400} />
            <SuccessScreen vehicle={savedVehicle} t={t} navigate={navigate} />
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Welcome screen ---------- */
function WelcomeScreen({ onAdd, onSkip, t }) {
  const features = [
    { Icon: Car, key: "garage" },
    { Icon: Wrench, key: "service" },
    { Icon: Sparkles, key: "ai" },
    { Icon: Store, key: "marketplace" },
  ];
  return (
    <div className="vehiq-card p-8 md:p-12 max-w-3xl w-full text-center" data-testid="onboarding-welcome">
      <div className="mb-4 flex justify-center"><Logo size="lg" /></div>
      <h1 className="vehiq-display text-4xl sm:text-5xl text-vehiq-text">{t("onboarding.welcomeTitle")}</h1>
      <p className="text-vehiq-muted mt-3 max-w-lg mx-auto">{t("onboarding.welcomeDesc")}</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-10">
        {features.map(({ Icon, key }) => (
          <div key={key} className="bg-vehiq-bg/50 border border-vehiq-border rounded-md p-4 transition-colors hover:border-vehiq-gold/50" data-testid={`onboarding-feature-${key}`}>
            <div className="h-10 w-10 mx-auto rounded-full bg-vehiq-gold-dim flex items-center justify-center text-vehiq-gold mb-3">
              <Icon size={20} />
            </div>
            <div className="text-sm font-medium text-vehiq-text">{t(`onboarding.features.${key}.title`)}</div>
            <div className="text-xs text-vehiq-muted mt-1">{t(`onboarding.features.${key}.desc`)}</div>
          </div>
        ))}
      </div>

      <button onClick={onAdd} className="vehiq-btn-primary mt-10 inline-flex items-center gap-2" data-testid="onboarding-add-first">
        {t("onboarding.addFirstVehicle")} <ArrowRight size={14} />
      </button>
      <div className="mt-3">
        <button onClick={onSkip} className="text-xs text-vehiq-muted hover:text-vehiq-gold underline-offset-2 hover:underline" data-testid="onboarding-skip-all">
          {t("onboarding.skipAndExplore")}
        </button>
      </div>
    </div>
  );
}

/* ---------- 3-step wizard ---------- */
function WizardCard({ stage, setStage, form, setForm, handlePhoto, submitVehicle, busy, t }) {
  const totalSteps = 3;
  const progress = (stage / totalSteps) * 100;

  return (
    <div className="vehiq-card p-6 md:p-10 max-w-xl w-full" data-testid={`onboarding-wizard-step-${stage}`}>
      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs uppercase tracking-widest text-vehiq-muted mb-2">
          <span>{t("onboarding.step")} {stage} / {totalSteps}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-1 bg-vehiq-nav rounded overflow-hidden">
          <div className="h-full bg-vehiq-gold transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {stage === 1 && (
        <div className="space-y-5">
          <h2 className="vehiq-display text-3xl text-vehiq-text">{t("onboarding.step1.title")}</h2>
          <p className="text-sm text-vehiq-muted">{t("onboarding.step1.desc")}</p>
          <div className="space-y-4">
            <div>
              <label className="vehiq-overline mb-2 block">{t("vehicle.make")}</label>
              <input data-testid="onboarding-make" list="ob-makes" autoFocus value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} className="vehiq-input text-lg py-3" />
              <datalist id="ob-makes">{POPULAR_MAKES.map((m) => <option key={m} value={m} />)}</datalist>
            </div>
            <div>
              <label className="vehiq-overline mb-2 block">{t("vehicle.model")}</label>
              <input data-testid="onboarding-model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="vehiq-input text-lg py-3" />
            </div>
            <div>
              <label className="vehiq-overline mb-2 block">{t("vehicle.year")}</label>
              <input data-testid="onboarding-year" type="number" min="1900" max="2030" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className="vehiq-input text-lg py-3" />
            </div>
          </div>
          <NavRow
            onBack={null}
            onNext={() => {
              if (!form.make.trim() || !form.model.trim()) {
                toast.error(t("onboarding.makeModelRequired"));
                return;
              }
              setStage(2);
            }}
            t={t}
          />
        </div>
      )}

      {stage === 2 && (
        <div className="space-y-5">
          <h2 className="vehiq-display text-3xl text-vehiq-text">{t("onboarding.step2.title")}</h2>
          <p className="text-sm text-vehiq-muted">{t("onboarding.step2.desc")}</p>
          <div>
            {form.photos[0] ? (
              <div className="relative w-full aspect-[4/3] rounded-md overflow-hidden border border-vehiq-gold/40">
                <img src={form.photos[0]} alt="cover" className="w-full h-full object-cover" />
                <button type="button" onClick={() => setForm({ ...form, photos: [] })} className="absolute top-2 right-2 bg-vehiq-bg/80 rounded-full p-1.5 text-vehiq-text" data-testid="onboarding-photo-remove">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <label className="block w-full aspect-[4/3] rounded-md border-2 border-dashed border-vehiq-gold/40 hover:border-vehiq-gold cursor-pointer flex flex-col items-center justify-center gap-2 transition-colors" data-testid="onboarding-photo-upload">
                <Upload size={28} className="text-vehiq-gold" />
                <div className="text-sm text-vehiq-muted">{t("onboarding.step2.uploadHint")}</div>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              </label>
            )}
          </div>
          <NavRow
            onBack={() => setStage(1)}
            onNext={() => setStage(3)}
            skipLabel={t("common.next")}
            t={t}
          />
        </div>
      )}

      {stage === 3 && (
        <div className="space-y-5">
          <h2 className="vehiq-display text-3xl text-vehiq-text">{t("onboarding.step3.title")}</h2>
          <p className="text-sm text-vehiq-muted">{t("onboarding.step3.desc")}</p>
          <div className="space-y-4">
            <div>
              <label className="vehiq-overline mb-2 block">{t("vehicle.mileage")}</label>
              <input data-testid="onboarding-mileage" type="number" min="0" value={form.mileage_current} onChange={(e) => setForm({ ...form, mileage_current: e.target.value })} className="vehiq-input text-lg py-3" />
            </div>
            <div>
              <label className="vehiq-overline mb-2 block">{t("vehicle.purchaseDate")}</label>
              <input data-testid="onboarding-purchase-date" type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} className="vehiq-input text-lg py-3" />
            </div>
          </div>
          <NavRow
            onBack={() => setStage(2)}
            onNext={submitVehicle}
            nextLabel={busy ? t("common.loading") : t("onboarding.finish")}
            disabled={busy}
            isFinal
            t={t}
          />
        </div>
      )}
    </div>
  );
}

function NavRow({ onBack, onNext, nextLabel, disabled, isFinal, t }) {
  return (
    <div className="flex items-center justify-between pt-4">
      {onBack ? (
        <button type="button" onClick={onBack} className="vehiq-btn-secondary inline-flex items-center gap-1" data-testid="onboarding-back">
          <ArrowLeft size={14} /> {t("common.back")}
        </button>
      ) : <div />}
      <button type="button" onClick={onNext} disabled={disabled} className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="onboarding-next">
        {nextLabel || t("common.next")} {!isFinal && <ArrowRight size={14} />}
      </button>
    </div>
  );
}

/* ---------- Success screen ---------- */
function SuccessScreen({ vehicle, t, navigate }) {
  const label = `${vehicle.make} ${vehicle.model}${vehicle.year ? " " + vehicle.year : ""}`;
  return (
    <div className="vehiq-card p-8 md:p-12 max-w-xl w-full text-center relative" data-testid="onboarding-success">
      <div className="inline-flex h-16 w-16 rounded-full bg-vehiq-gold-dim items-center justify-center text-vehiq-gold mb-3">
        <CheckCircle2 size={36} />
      </div>
      <h1 className="vehiq-display text-4xl text-vehiq-text">{t("onboarding.successTitle", { vehicle: label })}</h1>
      <p className="text-sm text-vehiq-muted mt-2">{t("onboarding.successDesc")}</p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
        <button onClick={() => navigate(`/garage/${vehicle.id}`)} className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="onboarding-go-vehicle">
          {t("onboarding.openVehicle")} <ArrowRight size={14} />
        </button>
        <button onClick={() => navigate("/garage")} className="vehiq-btn-secondary" data-testid="onboarding-go-garage">
          {t("onboarding.backToGarage")}
        </button>
      </div>
    </div>
  );
}
