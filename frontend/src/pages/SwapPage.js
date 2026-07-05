import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Heart, X, Repeat, Trash2, MessageCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import LazyImage from "@/components/LazyImage";
import EmptyState from "@/components/EmptyState";
import { SkeletonList } from "@/components/Skeleton";

/**
 * Swap deck — swipe-style browse of vehicles other users have listed for
 * exchange (Iter 39, P2 MVP). Two tabs:
 *   1. "Do przejrzenia" — deck of new cards, react with "Pogadajmy"/"Innym razem"
 *   2. "Moje dopasowania" — mutual matches with contact info
 *
 * When both sides mark each other "interested", the match is created
 * server-side and both users get a notification.
 */
export default function SwapPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("deck"); // deck | mine | matches
  const [deck, setDeck] = useState(null);
  const [matches, setMatches] = useState(null);
  const [mine, setMine] = useState(null);
  const [myVehicles, setMyVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [lookingFor, setLookingFor] = useState("");
  const [busy, setBusy] = useState(false);

  const loadDeck = useCallback(async () => {
    try {
      const { data } = await api.get("/swaps/deck");
      setDeck(data || []);
    } catch {
      setDeck([]);
    }
  }, []);

  const loadMatches = useCallback(async () => {
    try {
      const { data } = await api.get("/swaps/matches");
      setMatches(data || []);
    } catch {
      setMatches([]);
    }
  }, []);

  const loadMine = useCallback(async () => {
    try {
      const { data } = await api.get("/swaps/my-listings");
      setMine(data || []);
    } catch {
      setMine([]);
    }
    try {
      const { data } = await api.get("/vehicles");
      const active = (data || []).filter((v) => v.status !== "archived");
      setMyVehicles(active);
      if (active.length && !selectedVehicleId) setSelectedVehicleId(active[0].id);
    } catch { /* ignore */ }
  }, [selectedVehicleId]);

  useEffect(() => {
    loadDeck();
    loadMatches();
    loadMine();
  }, [loadDeck, loadMatches, loadMine]);

  const currentCard = deck && deck[0];

  const react = async (action) => {
    if (!currentCard) return;
    if (!myVehicles.length) {
      toast.error("Najpierw wystaw swoje auto do zamiany");
      setTab("mine");
      return;
    }
    // Pick a from_vehicle — first active listing, else first vehicle
    const fromId = (mine && mine[0]?.vehicle_id) || myVehicles[0]?.id;
    if (!fromId) return;
    setBusy(true);
    try {
      const { data } = await api.post("/swaps/interact", {
        vehicle_id: currentCard.vehicle.id,
        from_vehicle_id: fromId,
        action,
      });
      if (action === "interested") {
        try {
          const { trackEvent } = await import("@/hooks/usePageTracking");
          trackEvent("swap_interested", { matched: !!data.match });
        } catch { /* noop */ }
      }
      if (data.match) {
        toast.success("Znalazłeś partnera do zamiany! 🚗↔🚗", { duration: 5000 });
        loadMatches();
      } else if (action === "interested") {
        toast.success("Zapisano — czekamy na drugą stronę");
      }
      // Remove the card from the deck
      setDeck((d) => (d ? d.slice(1) : d));
    } catch (e) {
      toast.error(e?.response?.data?.detail?.message || "Błąd");
    } finally {
      setBusy(false);
    }
  };

  const listVehicle = async () => {
    if (!selectedVehicleId) {
      toast.error("Wybierz pojazd");
      return;
    }
    setBusy(true);
    try {
      const looking_for = lookingFor.split(",").map((s) => s.trim()).filter(Boolean);
      await api.post("/swaps/listing", {
        vehicle_id: selectedVehicleId,
        looking_for,
      });
      toast.success("Auto wystawione do zamiany");
      setShowAddForm(false);
      setLookingFor("");
      loadMine();
      loadDeck();
    } catch (e) {
      const detail = e?.response?.data?.detail;
      if (e?.response?.status === 402 && detail?.code === "swap_limit_free") {
        toast.error("Free tier: 1 aktywne auto na giełdzie. Przejdź na Premium.");
      } else {
        toast.error(detail?.message || detail || "Błąd");
      }
    } finally {
      setBusy(false);
    }
  };

  const removeListing = async (id) => {
    try {
      await api.delete(`/swaps/listing/${id}`);
      toast.success("Wycofano z giełdy");
      loadMine();
    } catch { toast.error("Błąd"); }
  };

  return (
    <div className="space-y-6" data-testid="swap-page">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-full bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center shrink-0">
          <Repeat size={20} />
        </div>
        <div>
          <h1 className="vehiq-display text-3xl text-vehiq-text">Giełda zamian</h1>
          <p className="text-sm text-vehiq-muted mt-1">
            Zamień swoje auto na inne. Gdy obie strony klikną "Pogadajmy" — łączymy Was.
          </p>
        </div>
      </div>

      <div className="inline-flex rounded-md border border-vehiq-border bg-vehiq-card p-1" data-testid="swap-tabs">
        {[
          { v: "deck", label: "Do przejrzenia" },
          { v: "matches", label: `Dopasowania${matches ? ` (${matches.length})` : ""}` },
          { v: "mine", label: "Moje wystawione" },
        ].map((opt) => (
          <button
            key={opt.v}
            onClick={() => setTab(opt.v)}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              tab === opt.v ? "bg-vehiq-gold text-vehiq-bg font-medium" : "text-vehiq-muted hover:text-vehiq-text"
            }`}
            data-testid={`swap-tab-${opt.v}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* --- Deck view --- */}
      {tab === "deck" && (
        <div data-testid="swap-deck">
          {deck === null ? (
            <SkeletonList count={1} />
          ) : deck.length === 0 ? (
            <EmptyState
              icon={Repeat}
              title="Brak nowych kart"
              description="Wróć później albo wystaw swoje auto — zwiększysz szansę na dopasowanie."
              action={<button onClick={() => setTab("mine")} className="vehiq-btn-primary">Moje wystawione</button>}
              dataTestId="swap-deck-empty"
            />
          ) : (
            <div className="max-w-xl mx-auto">
              <SwapCard card={currentCard} onReact={react} busy={busy} />
              {deck.length > 1 && (
                <div className="text-center text-xs text-vehiq-muted mt-3">
                  Zostało jeszcze {deck.length - 1} {deck.length - 1 === 1 ? "auto" : "aut"}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- Matches view --- */}
      {tab === "matches" && (
        <div className="space-y-3" data-testid="swap-matches">
          {matches === null ? (
            <SkeletonList count={3} />
          ) : matches.length === 0 ? (
            <EmptyState
              icon={MessageCircle}
              title="Brak dopasowań"
              description="Gdy druga strona też cię wybierze, pojawi się tutaj."
              dataTestId="swap-matches-empty"
            />
          ) : (
            matches.map((m) => (
              <div key={m.id} className="vehiq-card p-4 flex items-center gap-4" data-testid={`swap-match-${m.id}`}>
                <div className="h-16 w-24 rounded overflow-hidden shrink-0 bg-vehiq-bg">
                  <LazyImage src={m.other_vehicle.cover_photo} alt="" className="w-full h-full" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-vehiq-text">{m.other_vehicle.label}</div>
                  <div className="text-xs text-vehiq-muted">
                    {m.other_user?.name || "Właściciel"} • Twoje: {m.my_vehicle.label}
                  </div>
                  <div className="text-[10px] text-vehiq-muted/70 mt-1">
                    Dopasowanie {String(m.matched_at || "").slice(0, 10)}
                  </div>
                </div>
                {m.other_user?.email && (
                  <a
                    href={`mailto:${m.other_user.email}?subject=Zamiana%20aut%20Sharago`}
                    className="vehiq-btn-primary inline-flex items-center gap-1 shrink-0"
                    data-testid={`swap-match-contact-${m.id}`}
                  >
                    <MessageCircle size={13} /> Napisz
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* --- My swap listings --- */}
      {tab === "mine" && (
        <div className="space-y-4" data-testid="swap-mine">
          <div className="flex justify-end">
            <button onClick={() => setShowAddForm((s) => !s)} className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="swap-add-btn">
              <Plus size={14} /> Wystaw do zamiany
            </button>
          </div>
          {showAddForm && (
            <div className="vehiq-card p-4 space-y-3" data-testid="swap-add-form">
              <div>
                <label className="vehiq-overline mb-2 block">Pojazd</label>
                <select
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                  className="vehiq-input"
                  data-testid="swap-vehicle-select"
                >
                  {myVehicles.map((v) => (
                    <option key={v.id} value={v.id}>{v.make} {v.model} {v.year || ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="vehiq-overline mb-2 block">Czego szukasz w zamian</label>
                <input
                  value={lookingFor}
                  onChange={(e) => setLookingFor(e.target.value)}
                  placeholder="np. BMW M3, Porsche Boxster, Mercedes C63"
                  className="vehiq-input"
                  data-testid="swap-looking-for"
                />
                <div className="text-[11px] text-vehiq-muted mt-1">
                  Rozdzielaj przecinkami. Max 20 pozycji.
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAddForm(false)} className="vehiq-btn-secondary">Anuluj</button>
                <button onClick={listVehicle} disabled={busy} className="vehiq-btn-primary" data-testid="swap-submit">
                  {busy ? "..." : "Wystaw"}
                </button>
              </div>
              <div className="text-[11px] text-vehiq-muted">
                Free: 1 aktywne auto na giełdzie zamian. Premium — bez limitu.
              </div>
            </div>
          )}

          {mine === null ? (
            <SkeletonList count={2} />
          ) : mine.length === 0 ? (
            <EmptyState
              icon={Repeat}
              title="Brak aktywnych ofert"
              description="Wystaw swoje auto, żeby zwiększyć szansę na dopasowanie."
              dataTestId="swap-mine-empty"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {mine.map((l) => (
                <div key={l.id} className="vehiq-card p-4 flex items-center gap-3" data-testid={`swap-mine-${l.id}`}>
                  <div className="h-14 w-20 rounded overflow-hidden shrink-0 bg-vehiq-bg">
                    <LazyImage src={l.vehicle?.cover_photo} alt="" className="w-full h-full" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-vehiq-text truncate">{l.vehicle?.label || "—"}</div>
                    {l.looking_for?.length > 0 && (
                      <div className="text-xs text-vehiq-muted truncate">Szuka: {l.looking_for.join(", ")}</div>
                    )}
                  </div>
                  <button onClick={() => removeListing(l.id)} className="text-vehiq-muted hover:text-red-400" data-testid={`swap-mine-delete-${l.id}`} aria-label="Usuń">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SwapCard({ card, onReact, busy }) {
  const v = card.vehicle;
  return (
    <div className="vehiq-card overflow-hidden" data-testid="swap-card">
      <div className="aspect-[4/3] bg-vehiq-bg">
        <LazyImage src={v.cover_photo} alt="" className="w-full h-full" />
      </div>
      <div className="p-5 space-y-3">
        <div>
          <h2 className="vehiq-display text-2xl text-vehiq-text">
            {v.make} {v.model} {v.year || ""}
          </h2>
          <div className="text-xs text-vehiq-muted mt-1 flex flex-wrap gap-3">
            {v.mileage_current != null && (
              <span>{Number(v.mileage_current).toLocaleString("pl-PL")} km</span>
            )}
            {v.engine && <span>{v.engine}</span>}
            {v.fuel && <span>{v.fuel}</span>}
          </div>
        </div>
        {card.looking_for?.length > 0 && (
          <div className="pt-3 border-t border-vehiq-border">
            <div className="vehiq-overline mb-2">Szuka w zamian</div>
            <div className="flex flex-wrap gap-1.5">
              {card.looking_for.map((tag, i) => (
                <span key={i} className="inline-flex px-2 py-0.5 rounded-full text-[11px] bg-vehiq-gold-dim text-vehiq-gold border border-vehiq-gold/30">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-vehiq-border">
          <button
            onClick={() => onReact("pass")}
            disabled={busy}
            className="vehiq-btn-secondary inline-flex items-center justify-center gap-2"
            data-testid="swap-pass-btn"
          >
            <X size={14} /> Innym razem
          </button>
          <button
            onClick={() => onReact("interested")}
            disabled={busy}
            className="vehiq-btn-primary inline-flex items-center justify-center gap-2"
            data-testid="swap-interested-btn"
          >
            <Heart size={14} /> Pogadajmy
          </button>
        </div>
      </div>
    </div>
  );
}
