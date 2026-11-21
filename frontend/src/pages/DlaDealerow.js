import { Link } from "react-router-dom";
import { Store, QrCode, TrendingUp, Users, Check, ArrowRight } from "lucide-react";

/**
 * Marketing landing page for dealers (Iter 53).
 *
 * Analog of DlaWarsztatow — same layout, different copy focused on dealer
 * value props (inventory visibility, buyer confidence, service history).
 */
export default function DlaDealerow() {
  return (
    <div className="min-h-screen bg-vehiq-bg text-vehiq-text" data-testid="dla-dealerow-page">
      <section className="max-w-4xl mx-auto px-6 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-vehiq-gold/40 bg-vehiq-gold-dim px-3 py-1 text-[11px] text-vehiq-gold uppercase tracking-widest mb-6">
          <Store size={12} /> Dla dealerów i komisów
        </div>
        <h1 className="vehiq-display text-4xl sm:text-5xl lg:text-6xl leading-tight mb-6">
          Sprzedawaj auta z pełną historią serwisową.
          <br />
          <span className="text-vehiq-gold">Kupujący ufają autom z dokumentacją.</span>
        </h1>
        <p className="text-lg text-vehiq-muted max-w-2xl mx-auto mb-8">
          Każde auto w Twoim komisie ma cyfrową książkę serwisową Sharago.
          Kupujący widzi pełną historię przed rozmową — więcej pewnych klientów,
          krótsze rozmowy handlowe.
        </p>
        <Link
          to="/register/business?type=dealer"
          className="inline-flex items-center gap-2 vehiq-btn-primary text-base px-6 py-3"
          data-testid="dealer-register-cta"
        >
          Zarejestruj komis bezpłatnie <ArrowRight size={16} />
        </Link>
        <div className="text-xs text-vehiq-muted mt-3">Bez karty. Bez zobowiązań.</div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="vehiq-display text-3xl text-center mb-12">Jak to działa</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { Icon: Users, title: "1. Zarejestruj komis", body: "Nazwa, NIP, miasto. Konto w 2 minuty." },
            { Icon: QrCode, title: "2. Dodaj auta", body: "Każdemu autu przypisz cyfrową książkę serwisową." },
            { Icon: Store, title: "3. Publikuj oferty", body: "Auta z pełną historią pojawiają się w Giełdzie." },
            { Icon: TrendingUp, title: "4. Sprzedawaj szybciej", body: "Transparentność = mniej wątpliwości kupujących." },
          ].map(({ Icon, title, body }, i) => (
            <div key={i} className="vehiq-card p-6 space-y-3">
              <div className="h-10 w-10 rounded-full bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center">
                <Icon size={18} />
              </div>
              <h3 className="text-base font-semibold text-vehiq-text">{title}</h3>
              <p className="text-sm text-vehiq-muted leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-16 border-t border-vehiq-border">
        <h2 className="vehiq-display text-3xl mb-8">Co zyskujesz</h2>
        <ul className="space-y-4">
          {[
            "Cyfrowa książka serwisowa dla każdego auta w komisie",
            "Odznaka 'Weryfikowany dealer' przy Twoich ogłoszeniach",
            "Wyższa konwersja — historia buduje zaufanie kupujących",
            "Panel z listą aut i statystykami wyświetleń",
            "Bez zobowiązań — konto darmowe podczas fazy startowej",
          ].map((b, i) => (
            <li key={i} className="flex items-start gap-3">
              <Check size={18} className="text-vehiq-gold mt-1 shrink-0" />
              <span className="text-vehiq-text">{b}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16 text-center border-t border-vehiq-border">
        <h2 className="vehiq-display text-3xl mb-4">Zacznij dziś</h2>
        <Link
          to="/register/business?type=dealer"
          className="inline-flex items-center gap-2 vehiq-btn-primary text-base px-6 py-3"
          data-testid="dealer-register-cta-bottom"
        >
          Zarejestruj komis bezpłatnie <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}
