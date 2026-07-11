import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Check, Share2, Facebook, MessageCircle } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

/**
 * ReferralSection — user-facing invite widget for the Profile page.
 *
 * Renders the user's referral link with per-platform UTM-tagged variants
 * (facebook / tiktok / instagram / whatsapp / email / friend) so we can
 * attribute signups per channel in GA4 / admin dashboards.
 */

const CHANNELS = [
  { key: "friend",    label: "Ogólny link",      Icon: Share2 },
  { key: "facebook",  label: "Facebook",         Icon: Facebook },
  { key: "whatsapp",  label: "WhatsApp",         Icon: MessageCircle },
  { key: "tiktok",    label: "TikTok",           Icon: Share2 },
  { key: "instagram", label: "Instagram",        Icon: Share2 },
  { key: "email",     label: "E-mail",           Icon: Share2 },
];

function buildLink(code, channel) {
  const params = new URLSearchParams({
    ref: code,
    utm_source: channel,
    utm_medium: "referral",
    utm_campaign: "founding100",
  });
  return `https://sharago.pl/register?${params.toString()}`;
}

function StatCard({ label, value, testId, accent = false }) {
  return (
    <div
      className={`rounded-lg border p-4 ${accent ? "border-vehiq-gold/40 bg-vehiq-gold/5" : "border-vehiq-border bg-vehiq-card"}`}
      data-testid={testId}
    >
      <div className="text-[10px] uppercase tracking-widest text-vehiq-muted mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${accent ? "text-vehiq-gold" : "text-vehiq-text"}`}>{value}</div>
    </div>
  );
}

export default function ReferralSection({ user }) {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [copied, setCopied] = useState(null); // channel key of the last-copied link
  const [selected, setSelected] = useState("friend");

  useEffect(() => {
    api.get("/referral/stats").then((r) => setStats(r.data)).catch(() => {});
  }, []);

  const code = stats?.referral_code || user?.referral_code || "";
  const link = useMemo(() => (code ? buildLink(code, selected) : ""), [code, selected]);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(selected);
      toast.success(t("referral.copied", { defaultValue: "Skopiowano!" }));
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error(t("common.error"));
    }
  };

  const share = async () => {
    if (!link) return;
    const title = t("referral.shareTitle", { defaultValue: "Dołącz do Sharago" });
    const text = t("referral.shareText", {
      defaultValue: "Zbuduj swój wirtualny garaż na Sharago — używam tego i polecam.",
    });
    if (navigator.share) {
      try { await navigator.share({ title, text, url: link }); return; }
      catch { /* user cancelled — fall through to copy */ }
    }
    copy();
  };

  if (!code) return null;

  return (
    <section
      className="rounded-lg border border-vehiq-border bg-vehiq-card p-6 space-y-5"
      data-testid="referral-section"
    >
      <div>
        <h3 className="text-lg font-semibold text-vehiq-text mb-1" data-testid="referral-title">
          {t("referral.title", { defaultValue: "Zaproś znajomych i wygraj bilety na Regenwald" })}
        </h3>
        <p className="text-xs text-vehiq-muted leading-relaxed">
          {t("referral.subtitle", {
            defaultValue:
              "Każdy znajomy, który zarejestruje się przez Twój link i doda pojazd, daje Ci dodatkowy los w konkursie.",
          })}
        </p>
      </div>

      {/* Channel selector */}
      <div className="flex flex-wrap gap-2" data-testid="referral-channels">
        {CHANNELS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSelected(key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
              selected === key
                ? "border-vehiq-gold bg-vehiq-gold/15 text-vehiq-gold"
                : "border-vehiq-border text-vehiq-muted hover:text-vehiq-text hover:border-vehiq-muted"
            }`}
            data-testid={`referral-channel-${key}`}
          >
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      {/* Link box */}
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={link}
          className="vehiq-input text-xs flex-1 font-mono"
          data-testid="referral-link-input"
          onFocus={(e) => e.target.select()}
        />
        <button
          type="button"
          onClick={copy}
          className="vehiq-btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs shrink-0"
          data-testid="referral-copy-btn"
        >
          {copied === selected ? <Check size={14} /> : <Copy size={14} />}
          {t("referral.copy", { defaultValue: "Kopiuj" })}
        </button>
        <button
          type="button"
          onClick={share}
          className="vehiq-btn-primary inline-flex items-center gap-1.5 px-3 py-2 text-xs shrink-0"
          data-testid="referral-share-btn"
        >
          <Share2 size={14} />
          {t("referral.share", { defaultValue: "Udostępnij" })}
        </button>
      </div>

      {/* Stats + Founding Member badge */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label={t("referral.stats.invited", { defaultValue: "Zaproszonych" })}
          value={stats?.total ?? "—"}
          testId="referral-stat-total"
        />
        <StatCard
          label={t("referral.stats.qualified", { defaultValue: "Zakwalifikowanych" })}
          value={stats?.qualified ?? "—"}
          testId="referral-stat-qualified"
        />
        <StatCard
          label={t("referral.stats.tickets", { defaultValue: "Twoje losy" })}
          value={stats?.contest_tickets ?? "—"}
          testId="referral-stat-tickets"
          accent
        />
      </div>

      {stats?.is_founding_member && (
        <div
          className="flex items-center gap-3 rounded-md border border-vehiq-gold/40 bg-vehiq-gold/10 px-4 py-3"
          data-testid="referral-founding-badge"
        >
          <span className="text-lg">⭐</span>
          <div>
            <div className="text-sm font-medium text-vehiq-gold">
              {t("founding.title", { defaultValue: "Founding Member" })} #{stats.founding_member_number}
            </div>
            <div className="text-[11px] text-vehiq-muted">
              {t("founding.subtitle", {
                defaultValue: "Jesteś jednym z pierwszych 100 użytkowników Sharago — dziękujemy!",
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
