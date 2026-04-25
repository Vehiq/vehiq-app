import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { X } from "lucide-react";

/**
 * First-use spotlight tooltips. Renders an overlay with 3 sequential tooltips
 * pointing at elements identified by data-testid (selectors).
 *
 * Activates only when user.tooltips_seen === false. Marks tooltips_seen on
 * first dismissal so they never reappear.
 */
const STEPS = [
  { selector: '[data-testid="sidebar-garage"]', mobileSelector: '[data-testid="bottomnav-garage"]', placement: "right", key: "garage" },
  { selector: '[data-testid="sidebar-marketplace"]', mobileSelector: '[data-testid="bottomnav-marketplace"]', placement: "right", key: "marketplace" },
  { selector: '[data-testid="dashboard-fab-btn"]', mobileSelector: '[data-testid="dashboard-fab-btn"]', placement: "left", key: "ai" },
];

export default function FirstUseTooltips() {
  const { t } = useTranslation();
  const { user, updateProfile } = useAuth();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState(null);
  const persistedRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    // Show only once for users who completed onboarding but haven't seen tips.
    if (user.onboarded && !user.tooltips_seen) {
      // Tiny delay so layout settles
      const tm = setTimeout(() => setActive(true), 350);
      return () => clearTimeout(tm);
    }
  }, [user]);

  useEffect(() => {
    if (!active) return;
    const def = STEPS[step];
    if (!def) return;
    const isMobile = window.innerWidth < 768;
    const sel = isMobile ? (def.mobileSelector || def.selector) : def.selector;
    const el = document.querySelector(sel);
    if (!el) {
      // skip step if element not present
      next();
      return;
    }
    const rect = el.getBoundingClientRect();
    setTarget({ rect, placement: def.placement, key: def.key });
    const onResize = () => {
      const r = el.getBoundingClientRect();
      setTarget((s) => ({ ...s, rect: r }));
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step]);

  const persist = async () => {
    if (persistedRef.current) return;
    persistedRef.current = true;
    try { await updateProfile({ tooltips_seen: true }); } catch {}
  };

  const next = () => {
    if (step + 1 >= STEPS.length) {
      finish();
    } else {
      setStep((s) => s + 1);
    }
  };

  const finish = () => {
    setActive(false);
    setTarget(null);
    persist();
  };

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[80] pointer-events-none" data-testid="first-use-tooltips">
      {/* Dim overlay — always visible while active so users see the gate */}
      <div className="absolute inset-0 bg-black/55 transition-opacity pointer-events-auto" onClick={finish} data-testid="first-use-tooltips-overlay" />
      {target ? (
        <>
          {/* Spotlight ring */}
          <div
            className="absolute border-2 border-vehiq-gold rounded-md transition-all duration-300 pointer-events-none animate-pulse"
            style={{
              top: target.rect.top - 8,
              left: target.rect.left - 8,
              width: target.rect.width + 16,
              height: target.rect.height + 16,
              boxShadow: "0 0 0 9999px rgba(13,15,26,0.25)",
            }}
          />
          <TooltipCard
            target={target}
            step={step}
            total={STEPS.length}
            onNext={next}
            onSkip={finish}
            t={t}
          />
        </>
      ) : (
        // Fallback minimal card — shown if target element not found (e.g. hidden behind drawer)
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto vehiq-card border-vehiq-gold p-5 max-w-sm" data-testid={`tooltip-card-${STEPS[step]?.key || "fallback"}`}>
          <div className="text-xs uppercase tracking-widest text-vehiq-gold">{step + 1} / {STEPS.length}</div>
          <div className="text-sm text-vehiq-text mt-2">{t(`tooltips.${STEPS[step]?.key || "garage"}`)}</div>
          <div className="flex items-center justify-between mt-4 gap-2">
            <button onClick={finish} className="text-[11px] uppercase tracking-widest text-vehiq-muted hover:text-vehiq-gold" data-testid="tooltip-skip">{t("tooltips.skip")}</button>
            <button onClick={next} className="vehiq-btn-primary text-xs px-3 py-1.5" data-testid="tooltip-next">
              {step + 1 >= STEPS.length ? t("tooltips.gotIt") : t("tooltips.next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TooltipCard({ target, step, total, onNext, onSkip, t }) {
  const { rect, placement, key } = target;
  const isMobile = window.innerWidth < 768;
  const cardWidth = 280;
  const cardHeight = 140;
  let top, left;
  if (isMobile) {
    top = Math.max(20, rect.top - cardHeight - 14);
    left = Math.max(12, Math.min(window.innerWidth - cardWidth - 12, rect.left + rect.width / 2 - cardWidth / 2));
  } else if (placement === "right") {
    top = Math.max(20, rect.top + rect.height / 2 - cardHeight / 2);
    left = rect.right + 14;
    if (left + cardWidth > window.innerWidth - 12) left = rect.left - cardWidth - 14;
  } else {
    top = Math.max(20, rect.top + rect.height / 2 - cardHeight / 2);
    left = rect.left - cardWidth - 14;
    if (left < 12) left = rect.right + 14;
  }
  return (
    <div
      className="absolute pointer-events-auto vehiq-card border-vehiq-gold p-4 shadow-xl"
      style={{ top, left, width: cardWidth }}
      data-testid={`tooltip-card-${key}`}
    >
      <button onClick={onSkip} aria-label="close" className="absolute top-2 right-2 text-vehiq-muted hover:text-vehiq-text" data-testid="tooltip-close">
        <X size={14} />
      </button>
      <div className="text-xs uppercase tracking-widest text-vehiq-gold">{step + 1} / {total}</div>
      <div className="text-sm text-vehiq-text mt-2">{t(`tooltips.${key}`)}</div>
      <div className="flex items-center justify-between mt-4 gap-2">
        <button onClick={onSkip} className="text-[11px] uppercase tracking-widest text-vehiq-muted hover:text-vehiq-gold" data-testid="tooltip-skip">
          {t("tooltips.skip")}
        </button>
        <button onClick={onNext} className="vehiq-btn-primary text-xs px-3 py-1.5" data-testid="tooltip-next">
          {step + 1 >= total ? t("tooltips.gotIt") : t("tooltips.next")}
        </button>
      </div>
    </div>
  );
}
