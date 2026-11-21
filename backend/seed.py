"""Pre-populate MongoDB with legal pages, app settings and indexes."""
from datetime import datetime, timezone

LEGAL_SEED = [
    {
        "slug": "privacy-policy",
        "title_pl": "Polityka prywatności",
        "title_en": "Privacy Policy",
        "content_pl": """<h2>Polityka prywatności serwisu Sharago</h2>

<h3>1. Administrator danych</h3>
<p>Administratorem Twoich danych osobowych jest Jakub Zdybicki prowadzący działalność gospodarczą pod firmą Piksel Jakub Zdybicki, Terpentyna 197, 23-251 Terpentyna, NIP 715-181-28-34 (dalej: „Administrator”). Kontakt w sprawach danych osobowych: <a href="mailto:kontakt@sharago.com">kontakt@sharago.com</a>.</p>

<h3>2. Jakie dane przetwarzamy</h3>
<ul>
  <li>Dane konta: adres e-mail, nazwa użytkownika, hasło (w formie zaszyfrowanej), a przy logowaniu przez Google także imię, nazwisko i zdjęcie profilowe przekazane przez Google.</li>
  <li>Dane pojazdów: marka, model, rocznik, przebieg, zdjęcia oraz – jeśli je podasz – numer VIN i numer rejestracyjny.</li>
  <li>Historia serwisowa i przypomnienia: daty, przebiegi, wykonane czynności, koszty, terminy przeglądów i ubezpieczeń.</li>
  <li>Treści, które publikujesz: ogłoszenia na giełdzie, wpisy na forum, komentarze, wydarzenia.</li>
  <li>Zapytania do AI Mechanika i odpowiedzi na nie.</li>
  <li>Dane poleceń: kod polecający i informacja, kto kogo zaprosił.</li>
  <li>Dane techniczne: adres IP, typ przeglądarki i urządzenia, logi serwera, pliki cookies.</li>
</ul>

<h3>3. Cele i podstawy prawne</h3>
<table>
  <thead>
    <tr><th>Cel</th><th>Podstawa prawna (RODO)</th></tr>
  </thead>
  <tbody>
    <tr><td>Założenie i prowadzenie konta, garaż, historia serwisowa, przypomnienia, profil publiczny, giełda, forum, AI Mechanik</td><td>Art. 6 ust. 1 lit. b – wykonanie umowy (regulaminu)</td></tr>
    <tr><td>Wiadomości e-mail związane z kontem i przypomnienia</td><td>Art. 6 ust. 1 lit. b</td></tr>
    <tr><td>Bezpieczeństwo serwisu, zapobieganie nadużyciom, logi</td><td>Art. 6 ust. 1 lit. f – prawnie uzasadniony interes</td></tr>
    <tr><td>Statystyki odwiedzin (Google Analytics)</td><td>Art. 6 ust. 1 lit. a – Twoja zgoda (baner cookies)</td></tr>
    <tr><td>Rozpatrywanie reklamacji, dochodzenie i obrona roszczeń</td><td>Art. 6 ust. 1 lit. f</td></tr>
  </tbody>
</table>

<h3>4. Odbiorcy danych</h3>
<p>Dane powierzamy wyłącznie dostawcom, bez których serwis nie działa:</p>
<ul>
  <li>hosting i infrastruktura: Vercel Inc., Render Services Inc., MongoDB Inc. (baza danych), Cloudflare Inc. (przechowywanie zdjęć),</li>
  <li>wysyłka e-maili: Brevo (Sendinblue SAS),</li>
  <li>logowanie przez Google i statystyki: Google Ireland Ltd. / Google LLC,</li>
  <li>AI Mechanik: Anthropic PBC – otrzymuje treść Twojego zapytania, bez danych konta,</li>
  <li>obsługa księgowa i prawna Administratora,</li>
  <li>po uruchomieniu płatności: Stripe Payments Europe Ltd.</li>
</ul>
<p>Nie sprzedajemy Twoich danych.</p>

<h3>5. Przekazywanie danych poza EOG</h3>
<p>Część dostawców ma siedzibę w USA. Przekazanie odbywa się na podstawie decyzji Komisji Europejskiej w sprawie EU-US Data Privacy Framework lub standardowych klauzul umownych zatwierdzonych przez Komisję Europejską.</p>

<h3>6. Jak długo przechowujemy dane</h3>
<ul>
  <li>dane konta i treści – do usunięcia konta, a potem przez okres przedawnienia roszczeń,</li>
  <li>logi serwera – do 12 miesięcy,</li>
  <li>dane statystyczne Google Analytics – do 14 miesięcy.</li>
</ul>

<h3>7. Profil publiczny</h3>
<p>Na profilu publicznym widać Twoją nazwę użytkownika oraz pojazdy, których nie ukryłeś. Publiczny link do historii pojazdu widzi każdy, komu go przekażesz. Pojazd możesz ukryć lub oznaczyć jako sprzedany w dowolnej chwili. Numery rejestracyjne na zdjęciach możesz zamaskować w edytorze zdjęć.</p>

<h3>8. Twoje prawa</h3>
<p>Masz prawo do: dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, przeniesienia, sprzeciwu wobec przetwarzania opartego na prawnie uzasadnionym interesie oraz cofnięcia zgody w dowolnym momencie (bez wpływu na zgodność z prawem wcześniejszego przetwarzania). Napisz na <a href="mailto:kontakt@sharago.com">kontakt@sharago.com</a>. Masz też prawo złożyć skargę do Prezesa Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193 Warszawa).</p>
<p>Podanie danych jest dobrowolne, ale bez adresu e-mail nie założysz konta. Nie podejmujemy wobec Ciebie decyzji opartych wyłącznie na zautomatyzowanym przetwarzaniu.</p>

<h3>9. Pliki cookies</h3>
<p>Używamy cookies niezbędnych (logowanie, bezpieczeństwo) oraz – tylko po Twojej zgodzie – analitycznych (Google Analytics). Szczegóły i sposób zmiany zgody opisuje <a href="/legal/cookie-policy">Polityka cookies</a>.</p>

<h3>10. Zmiany polityki</h3>
<p>O istotnych zmianach poinformujemy e-mailem lub komunikatem w serwisie co najmniej 14 dni przed ich wejściem w życie.</p>
""",
        "content_en": "",
    },
    {
        "slug": "terms-of-service",
        "title_pl": "Regulamin",
        "title_en": "Terms of Service",
        "content_pl": """<h2>Regulamin serwisu Sharago</h2>

<h3>§1. Postanowienia ogólne</h3>
<ol>
  <li>Regulamin określa zasady korzystania z serwisu internetowego Sharago dostępnego pod adresami sharago.pl i sharago.com („Serwis”).</li>
  <li>Usługodawcą jest Jakub Zdybicki prowadzący działalność gospodarczą pod firmą Piksel Jakub Zdybicki, Terpentyna 197, 23-251 Terpentyna, NIP 715-181-28-34, e-mail: <a href="mailto:kontakt@sharago.com">kontakt@sharago.com</a> („Usługodawca”).</li>
  <li>Użytkownik to pełnoletnia osoba fizyczna, osoba prawna lub jednostka organizacyjna, która korzysta z Serwisu.</li>
</ol>

<h3>§2. Wymagania techniczne</h3>
<p>Do korzystania z Serwisu potrzebujesz urządzenia z dostępem do internetu, aktualnej przeglądarki z włączoną obsługą JavaScript i cookies oraz aktywnego adresu e-mail.</p>

<h3>§3. Konto</h3>
<ol>
  <li>Konto zakładasz przez formularz rejestracji lub przez logowanie Google. Założenie konta oznacza akceptację Regulaminu i zawarcie umowy o świadczenie usług drogą elektroniczną na czas nieokreślony.</li>
  <li>Każda osoba może mieć jedno konto. Odpowiadasz za poufność swojego hasła.</li>
  <li>W każdej chwili możesz zażądać usunięcia konta, pisząc na adres e-mail Usługodawcy. Usuwamy konto w ciągu 14 dni od zgłoszenia.</li>
</ol>

<h3>§4. Usługi</h3>
<ol>
  <li>Serwis umożliwia w szczególności: prowadzenie wirtualnego garażu i historii serwisowej pojazdów, ustawianie przypomnień, udostępnianie profilu publicznego i publicznej historii pojazdu, publikowanie ogłoszeń na giełdzie (w tym propozycji wymiany), udział w forum i wydarzeniach, korzystanie z AI Mechanika oraz z programu poleceń.</li>
  <li>Obecnie wszystkie usługi są bezpłatne. Usługodawca może wprowadzić plany płatne. Nastąpi to przez zmianę Regulaminu zgodnie z §10. Żaden Użytkownik nie zostanie obciążony opłatą bez wyraźnego zamówienia płatnego planu.</li>
  <li>Przypomnienia mają charakter pomocniczy. Za dotrzymanie terminów przeglądu, ubezpieczenia i serwisu odpowiada Użytkownik.</li>
  <li>AI Mechanik udziela odpowiedzi informacyjnych generowanych automatycznie. Odpowiedzi mogą być niepełne lub błędne i nie zastępują diagnozy wykwalifikowanego mechanika.</li>
  <li>Usługodawca nie jest stroną transakcji ani wymian zawieranych między Użytkownikami na giełdzie i nie odpowiada za stan, legalność ani opis oferowanych pojazdów i części.</li>
</ol>

<h3>§5. Treści Użytkowników</h3>
<ol>
  <li>Odpowiadasz za treści, które publikujesz: zdjęcia, opisy, ogłoszenia, wpisy i komentarze.</li>
  <li>Zakazane jest publikowanie treści niezgodnych z prawem, obraźliwych, wprowadzających w błąd, naruszających prawa osób trzecich (w tym wizerunek i prawa autorskie), spamu oraz ogłoszeń pojazdów lub części pochodzących z przestępstwa.</li>
  <li>Publikując treść, udzielasz Usługodawcy niewyłącznej, nieodpłatnej licencji na jej wyświetlanie w Serwisie przez czas jej publikacji.</li>
  <li>Usługodawca może usunąć treść naruszającą Regulamin. Każdy może zgłosić niedozwoloną treść na adres e-mail Usługodawcy. Zgłoszenie rozpatrujemy bez zbędnej zwłoki, a o decyzji informujemy autora treści wraz z uzasadnieniem.</li>
</ol>

<h3>§6. Zablokowanie konta</h3>
<p>Usługodawca może zablokować lub usunąć konto w przypadku poważnego lub uporczywego naruszania Regulaminu, po wcześniejszym wezwaniu do zaprzestania naruszeń, chyba że naruszenie jest rażące lub zagraża bezpieczeństwu Serwisu.</p>

<h3>§7. Dostępność i odpowiedzialność</h3>
<ol>
  <li>Usługodawca dokłada starań, aby Serwis działał bez przerw. Mogą wystąpić przerwy techniczne, o dłuższych informujemy z wyprzedzeniem, jeśli to możliwe.</li>
  <li>Zalecamy przechowywanie ważnych dokumentów pojazdu także poza Serwisem.</li>
</ol>

<h3>§8. Reklamacje</h3>
<ol>
  <li>Reklamacje zgłaszaj na adres <a href="mailto:kontakt@sharago.com">kontakt@sharago.com</a>, opisując problem i podając adres e-mail konta.</li>
  <li>Odpowiadamy w ciągu 14 dni od otrzymania reklamacji.</li>
</ol>

<h3>§9. Konsumenci</h3>
<ol>
  <li>Konsument może skorzystać z pozasądowych sposobów rozpatrywania sporu, w tym z pomocy powiatowego (miejskiego) rzecznika konsumentów lub wojewódzkiego inspektoratu Inspekcji Handlowej.</li>
  <li>Przepisy dotyczące konsumentów stosuje się także do osób fizycznych prowadzących działalność gospodarczą, gdy umowa nie ma dla nich charakteru zawodowego.</li>
</ol>

<h3>§10. Zmiany Regulaminu</h3>
<p>O zmianie Regulaminu informujemy e-mailem i komunikatem w Serwisie co najmniej 14 dni przed jej wejściem w życie. Jeśli nie akceptujesz zmian, możesz usunąć konto przed tym terminem.</p>

<h3>§11. Postanowienia końcowe</h3>
<p>W sprawach nieuregulowanych stosuje się prawo polskie, w szczególności Kodeks cywilny i ustawę o świadczeniu usług drogą elektroniczną. Zasady przetwarzania danych osobowych opisuje <a href="/legal/privacy-policy">Polityka prywatności</a>.</p>
""",
        "content_en": "",
    },
    {
        "slug": "cookie-policy",
        "title_pl": "Polityka cookies",
        "title_en": "Cookie Policy",
        "content_pl": """<h2>Polityka plików cookies serwisu Sharago</h2>

<h3>1. Czym są pliki cookies</h3>
<p>Pliki cookies to małe pliki tekstowe zapisywane na Twoim urządzeniu przez przeglądarkę. Podobnie działają inne technologie, np. pamięć lokalna przeglądarki (localStorage). W tej polityce nazywamy je wszystkie „cookies”.</p>
<p>Administratorem jest Jakub Zdybicki prowadzący działalność gospodarczą pod firmą Piksel Jakub Zdybicki, Terpentyna 197, 23-251 Terpentyna, NIP 715-181-28-34, e-mail: <a href="mailto:kontakt@sharago.com">kontakt@sharago.com</a>.</p>

<h3>2. Jakich cookies używamy</h3>
<table>
  <thead>
    <tr><th>Rodzaj</th><th>Po co</th><th>Czy wymaga zgody</th><th>Jak długo</th></tr>
  </thead>
  <tbody>
    <tr><td>Niezbędne</td><td>Logowanie i utrzymanie sesji, bezpieczeństwo, zapamiętanie Twojej decyzji dotyczącej cookies</td><td>Nie – bez nich serwis nie działa</td><td>Do wylogowania lub do 12 miesięcy</td></tr>
    <tr><td>Analityczne (Google Analytics 4)</td><td>Anonimowe statystyki: ile osób odwiedza serwis, z jakich źródeł, które funkcje są używane. Pomagają nam poprawiać Sharago</td><td>Tak – zapisujemy je dopiero po Twojej zgodzie</td><td>Do 2 lat (pliki _ga i _ga_*)</td></tr>
  </tbody>
</table>
<p>Nie używamy cookies reklamowych ani nie śledzimy Cię w innych serwisach.</p>
<p>Przy logowaniu przez Google pliki cookies może zapisywać Google, na zasadach opisanych w jego polityce prywatności.</p>

<h3>3. Zgoda i jej zmiana</h3>
<p>Przy pierwszej wizycie pokazujemy baner, w którym wybierasz: „Akceptuję wszystkie” albo „Tylko niezbędne”. Zgodę możesz w każdej chwili zmienić lub wycofać w „Ustawieniach cookies” w stopce serwisu. Wycofanie zgody nie wpływa na zgodność z prawem wcześniejszego przetwarzania.</p>

<h3>4. Ustawienia przeglądarki</h3>
<p>Możesz też usunąć cookies lub zablokować ich zapisywanie w ustawieniach swojej przeglądarki. Zablokowanie cookies niezbędnych może uniemożliwić logowanie i korzystanie z serwisu.</p>

<h3>5. Więcej informacji</h3>
<p>Szczegóły dotyczące przetwarzania danych osobowych i Twoich praw opisuje <a href="/legal/privacy-policy">Polityka prywatności</a>.</p>
""",
        "content_en": "",
    },
    # Legacy slugs retained so fresh installs still provision marketplace &
    # contact pages. Seed is non-destructive — existing docs are never overwritten.
    {
        "slug": "marketplace-terms",
        "title_pl": "Regulamin Marketplace",
        "title_en": "Marketplace Terms",
        "content_pl": """<h2>Regulamin Marketplace Sharago</h2>
<p>Marketplace to część serwisu Sharago umożliwiająca publikowanie ogłoszeń sprzedaży, wynajmu, usług oraz zamian. Szczegółowe zasady i obowiązki użytkowników opisuje <a href="/legal/terms-of-service">Regulamin</a>.</p>
<p>Kontakt: <a href="mailto:kontakt@sharago.com">kontakt@sharago.com</a></p>""",
        "content_en": "",
    },
    {
        "slug": "contact",
        "title_pl": "Kontakt",
        "title_en": "Contact",
        "content_pl": """<h2>Kontakt</h2>
<p>Napisz do nas: <a href="mailto:kontakt@sharago.com">kontakt@sharago.com</a></p>
<p>Odpowiadamy w ciągu 48 godzin roboczych.</p>""",
        "content_en": "",
    },
]

DEFAULT_SETTINGS = {
    "google_oauth_enabled": "true",
    "facebook_oauth_enabled": "false",
    "email_login_enabled": "true",
    "ai_chatbot_enabled": "true",
    "marketplace_enabled": "true",
    "forum_enabled": "true",
    "registrations_enabled": "true",
    "gps_tracking_enabled": "true",
    "max_vehicles_per_user": "0",
    "max_photos_per_vehicle": "6",
    "max_listings_per_user": "10",
    "max_forum_posts_per_day": "50",
    "maintenance_mode": "false",
    "maintenance_message_pl": "",
    "maintenance_message_en": "",
}

DEFAULT_CMS = {
    "hero_title": {
        "value_pl": "Twój wirtualny garaż",
        "value_en": "Your virtual garage"
    },
    "hero_subtitle": {
        "value_pl": "Historia serwisowa, analiza kosztów, AI mechanik i marketplace — wszystko w jednym miejscu.",
        "value_en": "Service history, cost analytics, AI mechanic and marketplace — all in one place."
    },
    "cta_button": {
        "value_pl": "Rozpocznij za darmo",
        "value_en": "Start for free"
    },
    "feature_garage_title": {
        "value_pl": "Wirtualny garaż",
        "value_en": "Virtual garage"
    },
    "feature_garage_desc": {
        "value_pl": "Wszystkie Twoje pojazdy w stylu tabletu diagnostycznego Autel.",
        "value_en": "All your vehicles in Autel diagnostic tablet style."
    },
    "feature_ai_title": {
        "value_pl": "AI Mechanik",
        "value_en": "AI Mechanic"
    },
    "feature_ai_desc": {
        "value_pl": "Diagnoza usterek z kontekstem Twojego pojazdu — Claude Sonnet 4.5.",
        "value_en": "Fault diagnosis with your vehicle context — Claude Sonnet 4.5."
    },
    "feature_pl_title": {
        "value_pl": "P&L pojazdu",
        "value_en": "Vehicle P&L"
    },
    "feature_pl_desc": {
        "value_pl": "Wiesz dokładnie ile kosztował Cię każdy samochód — od zakupu do sprzedaży.",
        "value_en": "Know exactly what each car cost you — from purchase to sale."
    },
    "announcement_enabled": {"value_pl": "false", "value_en": "false"},
    "announcement_text": {"value_pl": "", "value_en": ""},
}


async def seed_database(db):
    # Indexes
    await db.profiles.create_index("email", unique=True)
    await db.profiles.create_index("id", unique=True)
    await db.profiles.create_index("slug", sparse=True)
    await db.vehicles.create_index("id", unique=True)
    await db.vehicles.create_index("user_id")
    await db.vehicles.create_index("slug")
    await db.legal_pages.create_index("slug", unique=True)
    await db.cms_content.create_index("key", unique=True)
    await db.app_settings.create_index("key", unique=True)
    await db.page_views.create_index("visited_at")
    await db.listings.create_index([("type", 1), ("status", 1)])
    await db.listings.create_index([("category", 1), ("status", 1), ("created_at", -1)])
    await db.listings.create_index([("make", 1), ("model", 1)])
    # Sort/filter indexes — required to avoid 32MB in-memory sort on large collections
    await db.listings.create_index([("created_at", -1)])
    await db.listings.create_index([("featured", -1), ("created_at", -1)])
    await db.listings.create_index([("price", 1)])
    await db.listings.create_index([("user_id", 1), ("created_at", -1)])
    await db.listings.create_index("id", unique=True)
    await db.services.create_index("slug", sparse=True)
    await db.services.create_index([("location.lat", 1), ("location.lng", 1)])
    await db.events.create_index("slug", sparse=True)
    await db.events.create_index("date_start")
    await db.events.create_index([("location.lat", 1), ("location.lng", 1)])
    await db.event_comments.create_index("event_id")
    await db.event_comments.create_index([("event_id", 1), ("created_at", -1)])
    await db.service_reviews.create_index("service_id")
    try:
        await db.service_reviews.create_index([("service_id", 1), ("user_id", 1)], unique=True)
    except Exception:
        pass
    # Blog
    try:
        await db.blog_posts.create_index("id", unique=True)
    except Exception:
        pass
    try:
        await db.blog_posts.create_index("slug", unique=True)
    except Exception:
        pass
    await db.blog_posts.create_index([("published", 1), ("published_at", -1)])
    # Vehicle views — unique index for per-day-per-session throttling.
    try:
        await db.vehicle_views.create_index(
            [("vehicle_slug", 1), ("session_id", 1), ("date", 1)],
            unique=True,
        )
    except Exception:
        pass

    # Backfill: ensure all profiles have a slug + default privacy_settings
    import re as _re
    DEFAULT_PRIVACY_SEED = {
        "profile_public": True,
        "show_total_km": True,
        "show_forum": True,
        "show_listings": True,
        "show_garage_card": True,
        "searchable": True,
    }
    async for p in db.profiles.find({"$or": [{"slug": {"$exists": False}}, {"slug": None}, {"privacy_settings": {"$exists": False}}]}, {"_id": 0, "id": 1, "name": 1, "email": 1, "slug": 1, "privacy_settings": 1}):
        update = {}
        if not p.get("slug"):
            base = _re.sub(r"[^a-z0-9]+", "-", (p.get("name") or (p.get("email") or "user").split("@")[0]).lower()).strip("-") or "user"
            slug = base
            suffix = 1
            while await db.profiles.find_one({"slug": slug, "id": {"$ne": p["id"]}}, {"_id": 0, "id": 1}):
                suffix += 1
                slug = f"{base}-{suffix}"
            update["slug"] = slug
        if not p.get("privacy_settings"):
            update["privacy_settings"] = DEFAULT_PRIVACY_SEED.copy()
        if update:
            await db.profiles.update_one({"id": p["id"]}, {"$set": update})

    # Seed legal pages with January 26, 2025 as default last_updated
    default_date = "2025-01-26T00:00:00+00:00"
    for page in LEGAL_SEED:
        existing = await db.legal_pages.find_one({"slug": page["slug"]})
        if not existing:
            page["last_updated"] = default_date
            page["updated_by"] = None
            await db.legal_pages.insert_one(page)
        else:
            # Update only the last_updated if it's still the seeded ISO datetime from before (best-effort: only set if missing)
            if not existing.get("last_updated"):
                await db.legal_pages.update_one({"slug": page["slug"]}, {"$set": {"last_updated": default_date}})

    # Seed app settings
    for key, value in DEFAULT_SETTINGS.items():
        existing = await db.app_settings.find_one({"key": key})
        if not existing:
            await db.app_settings.insert_one({
                "key": key, "value": value,
                "updated_at": datetime.now(timezone.utc).isoformat()
            })

    # Seed CMS content
    for key, vals in DEFAULT_CMS.items():
        existing = await db.cms_content.find_one({"key": key})
        if not existing:
            await db.cms_content.insert_one({
                "key": key,
                "value_pl": vals["value_pl"],
                "value_en": vals["value_en"],
                "updated_at": datetime.now(timezone.utc).isoformat()
            })

    # Auto-seed admin from ADMIN_PASSWORD env (if set and admin doesn't exist yet)
    import os
    import bcrypt as _bcrypt
    admin_email = os.environ.get("ADMIN_EMAIL", "kontakt@sharago.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    existing_admin = await db.admin_account.find_one({"email": admin_email})
    if not existing_admin and admin_password:
        pw_hash = _bcrypt.hashpw(admin_password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")
        await db.admin_account.insert_one({
            "email": admin_email,
            "password_hash": pw_hash,
            "first_login": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
