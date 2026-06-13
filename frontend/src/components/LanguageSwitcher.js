import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";

const FlagPL = () => (
  <span className="inline-flex h-4 w-6 overflow-hidden rounded-sm border border-vehiq-border">
    <span className="h-1/2 w-full bg-white" />
    <span className="h-1/2 w-full bg-[#DC143C] absolute mt-2" />
  </span>
);

export default function LanguageSwitcher({ compact = false }) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = i18n.language?.startsWith("en") ? "en" : "pl";
  const change = (lng) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("sharago_lang", lng);
    setOpen(false);
  };

  return (
    <div className="relative" data-testid="language-switcher">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex items-center gap-2 rounded-md border border-vehiq-border bg-vehiq-card/40 px-3 py-1.5 text-sm text-vehiq-text hover:bg-vehiq-gold-dim transition-colors"
        data-testid="language-switcher-button"
      >
        <span className="text-base leading-none">{current === "pl" ? "🇵🇱" : "🇬🇧"}</span>
        {!compact && <span className="uppercase tracking-wider text-xs">{current}</span>}
        <ChevronDown size={14} className="text-vehiq-muted" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-32 rounded-md border border-vehiq-border bg-vehiq-card shadow-lg z-50 overflow-hidden"
          data-testid="language-switcher-menu"
        >
          <button
            type="button"
            onClick={() => change("pl")}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-vehiq-gold-dim text-vehiq-text"
            data-testid="lang-option-pl"
          >
            <span>🇵🇱</span> Polski
          </button>
          <button
            type="button"
            onClick={() => change("en")}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-vehiq-gold-dim text-vehiq-text"
            data-testid="lang-option-en"
          >
            <span>🇬🇧</span> English
          </button>
        </div>
      )}
    </div>
  );
}
