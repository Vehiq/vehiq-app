import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { MapPin, Phone, Globe, Mail, Trash2, Edit3, ArrowLeft } from "lucide-react";

export default function ServiceDetail() {
  const { slug } = useParams();
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [s, setS] = useState(null);

  useEffect(() => {
    api.get(`/services/${slug}`).then(r => setS(r.data)).catch(() => setS(false));
  }, [slug]);

  const remove = async () => {
    if (!window.confirm("Delete?")) return;
    await api.delete(`/services/${s.id}`);
    toast.success(t("common.success"));
    navigate("/services");
  };

  if (s === null) return null;
  if (s === false) return <div className="text-center text-vehiq-muted py-12">404</div>;
  const isOwner = user?.id === s.owner_id;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl" data-testid="service-detail">
      <Link to="/services" className="text-xs text-vehiq-muted hover:text-vehiq-gold inline-flex items-center gap-1"><ArrowLeft size={12}/> {t("services.back")}</Link>
      <div className="vehiq-card p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="vehiq-display text-3xl text-vehiq-text">{s.name}</h1>
            <div className="text-xs uppercase tracking-widest text-vehiq-gold mt-1">{t(`services.cats.${s.category}`, { defaultValue: s.category })}{s.verified ? ` · ${t("services.verified")}` : ""}</div>
          </div>
          {isOwner && (
            <div className="flex gap-2">
              <Link to={`/services/${s.id}/edit`} className="vehiq-btn-secondary text-xs inline-flex items-center gap-1"><Edit3 size={12}/> {t("common.edit")}</Link>
              <button onClick={remove} className="text-xs text-red-400 hover:text-red-300 inline-flex items-center gap-1 px-2"><Trash2 size={12}/></button>
            </div>
          )}
        </div>
        {s.description && <p className="text-sm text-vehiq-text whitespace-pre-line">{s.description}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="vehiq-card p-5 space-y-3">
          <div className="vehiq-overline">{t("services.location")}</div>
          {s.location?.address && <div className="text-sm text-vehiq-text inline-flex items-center gap-2"><MapPin size={14} className="text-vehiq-gold"/> {s.location.address}, {s.location.city}</div>}
          {s.location?.lat != null && s.location?.lng != null && (
            <a href={`https://www.openstreetmap.org/?mlat=${s.location.lat}&mlon=${s.location.lng}#map=16/${s.location.lat}/${s.location.lng}`} target="_blank" rel="noreferrer" className="text-xs text-vehiq-gold hover:underline">
              {t("services.openMap")} →
            </a>
          )}
        </div>
        <div className="vehiq-card p-5 space-y-3">
          <div className="vehiq-overline">{t("services.contact")}</div>
          {s.phone && <div className="text-sm text-vehiq-text inline-flex items-center gap-2"><Phone size={14} className="text-vehiq-gold"/> <a href={`tel:${s.phone}`} className="hover:text-vehiq-gold">{s.phone}</a></div>}
          {s.email && <div className="text-sm text-vehiq-text inline-flex items-center gap-2"><Mail size={14} className="text-vehiq-gold"/> <a href={`mailto:${s.email}`} className="hover:text-vehiq-gold">{s.email}</a></div>}
          {s.website && <div className="text-sm text-vehiq-text inline-flex items-center gap-2"><Globe size={14} className="text-vehiq-gold"/> <a href={s.website} target="_blank" rel="noreferrer" className="hover:text-vehiq-gold">{s.website}</a></div>}
        </div>
      </div>

      {s.services?.length > 0 && (
        <div className="vehiq-card p-5 space-y-3">
          <div className="vehiq-overline">{t("services.services")}</div>
          <div className="flex flex-wrap gap-2">
            {s.services.map(x => <span key={x} className="text-xs px-2 py-1 rounded bg-vehiq-bg border border-vehiq-border text-vehiq-text">{x}</span>)}
          </div>
        </div>
      )}
      {s.brands?.length > 0 && (
        <div className="vehiq-card p-5 space-y-3">
          <div className="vehiq-overline">{t("services.brands")}</div>
          <div className="flex flex-wrap gap-2">
            {s.brands.map(b => <span key={b} className="text-xs uppercase tracking-wider px-2 py-1 rounded bg-vehiq-gold-dim text-vehiq-gold border border-vehiq-gold/40">{b}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}
