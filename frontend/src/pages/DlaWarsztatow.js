import { Link } from "react-router-dom";
import { Wrench, QrCode, Users, Search, Check, ArrowRight } from "lucide-react";

/**
 * Marketing landing page for workshops (Iter 53).
 *
 * Public — no auth required. CTAs point to /register/business?type=workshop
 * where the actual account is provisioned.
 */
export default function DlaWarsztatow() {
  return (
    <div className="min-h-screen bg-vehiq-bg text-vehiq-text" data-testid="dla-warsztatow-page">
      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-vehiq-gold/40 bg-vehiq-gold-dim px-3 py-1 text-[11px] text-vehiq-gold uppercase tracking-widest mb-6">
          <Wrench size={12} /> Dla warsztatów
        </div>
        <h1 className="vehiq-display text-4xl sm:text-5xl lg:text-6xl leading-tight mb-6">
          Twoi klienci mają historię serwisową online.
          <br />
          <span className="text-vehiq-gold">Ty masz więcej powracających klientów.</span>
        </h1>
        <p className="text-lg text-vehiq-muted max-w-2xl mx-auto mb-8">
          Skanuj kod QR z szyby auta klienta. Dodawaj wpisy serwisowe.
          Klient widzi je natychmiast — pełna transparentność buduje zaufanie
          i lojalność.
        </p>
        <Link
          to="/register/business?type=workshop"
          className="inline-flex items-center gap-2 vehiq-btn-primary text-base px-6 py-3"
          data-testid="warsztat-register-cta"
        >
          Zarejestruj warsztat bezpłatnie <ArrowRight size={16} />
        </Link>
        <div className="text-xs text-vehiq-muted mt-3">Bez karty. Bez zobowiązań. Bez limitu czasu.</div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="vehiq-display text-3xl text-center mb-12">Jak to działa</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { Icon: Users, title: "1. Zarejestruj", body: "Podaj nazwę, miasto i telefon. Zajmuje 60 sekund." },
            { Icon: QrCode, title: "2. Skanuj QR", body: "Klient pokazuje QR z szyby lub wlewu paliwa." },
            { Icon: Wrench, title: "3. Dodaj wpis", body: "Wpis pojawia się natychmiast w historii pojazdu." },
            { Icon: Search, title: "4. Bądź widoczny", body: "Twój warsztat pojawia się w wyszukiwarce Sharago." },
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

      {/* Benefits */}
      <section className="max-w-4xl mx-auto px-6 py-16 border-t border-vehiq-border">
        <h2 className="vehiq-display text-3xl mb-8">Dlaczego warsztaty wybierają Sharago</h2>
        <ul className="space-y-4">
          {[
            "Więcej powracających klientów — historia serwisowa buduje lojalność",
            "Widoczność w wyszukiwarce warsztatów Sharago",
            "Zero kosztów startowych — konto bezpłatne do pierwszego skanu",
            "Panel z listą klientów i historią serwisów",
            "Bez zobowiązań — możesz w każdej chwili zrezygnować",
          ].map((b, i) => (
            <li key={i} className="flex items-start gap-3">
              <Check size={18} className="text-vehiq-gold mt-1 shrink-0" />
              <span className="text-vehiq-text">{b}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto px-6 py-16 text-center border-t border-vehiq-border">
        <h2 className="vehiq-display text-3xl mb-4">Gotowy?</h2>
        <p className="text-vehiq-muted mb-6">
          Rejestracja bez karty. Aktywacja automatyczna po pierwszym skanie QR.
        </p>
        <Link
          to="/register/business?type=workshop"
          className="inline-flex items-center gap-2 vehiq-btn-primary text-base px-6 py-3"
          data-testid="warsztat-register-cta-bottom"
        >
          Zarejestruj warsztat bezpłatnie <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}
