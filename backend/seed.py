"""Pre-populate MongoDB with legal pages, app settings and indexes."""
from datetime import datetime, timezone

LEGAL_SEED = [
    {
        "slug": "privacy-policy",
        "title_pl": "Polityka Prywatności",
        "title_en": "Privacy Policy",
        "content_pl": """<h2>Polityka Prywatności VEHIQ</h2>
<p><strong>Administrator danych:</strong> VEHIQ, e-mail: kontakt@vehiq.pl, https://vehiq.pl</p>
<h3>1. Jakie dane zbieramy</h3>
<ul><li>Dane konta: imię, e-mail, hasło (zaszyfrowane), avatar, lokalizacja.</li>
<li>Dane pojazdów i historia serwisowa.</li>
<li>Dane techniczne: adres IP, typ urządzenia, język przeglądarki.</li></ul>
<h3>2. Cele przetwarzania (RODO art. 6)</h3>
<ul><li>Świadczenie usługi VEHIQ (art. 6 ust. 1 lit. b).</li>
<li>Marketing własny — za zgodą (art. 6 ust. 1 lit. a).</li>
<li>Bezpieczeństwo i wykrywanie nadużyć (art. 6 ust. 1 lit. f).</li></ul>
<h3>3. Twoje prawa (RODO art. 13)</h3>
<p>Masz prawo do dostępu, sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia danych oraz wniesienia sprzeciwu. Skontaktuj się: kontakt@vehiq.pl.</p>
<h3>4. Okres przechowywania</h3>
<p>Dane konta przechowujemy do momentu jego usunięcia. Dane rozliczeniowe — 5 lat (wymóg podatkowy).</p>
<h3>5. Bezpieczeństwo</h3>
<p>Stosujemy szyfrowanie TLS, hashowanie haseł (bcrypt), kontrolę dostępu role-based.</p>
<h3>6. Cookies</h3>
<p>Zob. <a href="/pl/polityka-cookies">Polityka Cookies</a>.</p>""",
        "content_en": """<h2>VEHIQ Privacy Policy</h2>
<p><strong>Data controller:</strong> VEHIQ, email: kontakt@vehiq.pl, https://vehiq.pl</p>
<h3>1. What data we collect</h3>
<ul><li>Account data: name, email, password (hashed), avatar, location.</li>
<li>Vehicle data and service history.</li>
<li>Technical data: IP address, device type, browser language.</li></ul>
<h3>2. Purposes of processing (GDPR art. 6)</h3>
<ul><li>Providing the VEHIQ service (art. 6(1)(b)).</li>
<li>Own marketing — with consent (art. 6(1)(a)).</li>
<li>Security and abuse detection (art. 6(1)(f)).</li></ul>
<h3>3. Your rights (GDPR art. 13)</h3>
<p>You have the right to access, rectify, erase, restrict processing, data portability and to object. Contact: kontakt@vehiq.pl.</p>
<h3>4. Retention period</h3>
<p>Account data is kept until you delete it. Billing data — 5 years (tax requirement).</p>
<h3>5. Security</h3>
<p>We use TLS encryption, password hashing (bcrypt), role-based access control.</p>
<h3>6. Cookies</h3>
<p>See <a href="/en/cookie-policy">Cookie Policy</a>.</p>""",
    },
    {
        "slug": "terms-of-service",
        "title_pl": "Regulamin",
        "title_en": "Terms of Service",
        "content_pl": """<h2>Regulamin VEHIQ</h2>
<h3>1. Postanowienia ogólne</h3>
<p>Niniejszy regulamin określa zasady korzystania z platformy VEHIQ — wirtualnego garażu dostępnego pod https://vehiq.pl.</p>
<h3>2. Konto użytkownika</h3>
<p>Rejestracja jest bezpłatna. Użytkownik zobowiązuje się do podawania prawdziwych danych i ochrony hasła.</p>
<h3>3. Zasady korzystania</h3>
<ul><li>Zakaz publikowania treści niezgodnych z prawem.</li>
<li>Zakaz spamu, oszustw i nadużyć w marketplace.</li>
<li>Zakaz prób obejścia zabezpieczeń.</li></ul>
<h3>4. Odpowiedzialność</h3>
<p>VEHIQ świadczy usługę „as is" i nie ponosi odpowiedzialności za poradnictwo AI mechanika — to wsparcie informacyjne, nie zastępuje wizyty u specjalisty.</p>
<h3>5. Marketplace</h3>
<p>VEHIQ jest platformą — nie jest stroną transakcji. Zob. <a href="/pl/regulamin-marketplace">Regulamin Marketplace</a>.</p>
<h3>6. Rozwiązanie umowy</h3>
<p>Możesz w każdej chwili usunąć konto. Możemy zawiesić konto w przypadku naruszeń.</p>
<h3>7. Kontakt</h3>
<p>kontakt@vehiq.pl</p>""",
        "content_en": """<h2>VEHIQ Terms of Service</h2>
<h3>1. General provisions</h3>
<p>These terms govern the use of the VEHIQ virtual garage platform at https://vehiq.pl.</p>
<h3>2. User account</h3>
<p>Registration is free. The user agrees to provide accurate data and protect their password.</p>
<h3>3. Acceptable use</h3>
<ul><li>No unlawful content.</li>
<li>No spam, fraud, or marketplace abuse.</li>
<li>No attempts to bypass security.</li></ul>
<h3>4. Liability</h3>
<p>VEHIQ is provided "as is". AI Mechanic offers informational support, not a substitute for a professional mechanic.</p>
<h3>5. Marketplace</h3>
<p>VEHIQ is a platform — not a party to transactions. See <a href="/en/marketplace-terms">Marketplace Terms</a>.</p>
<h3>6. Termination</h3>
<p>You may delete your account at any time. We may suspend accounts violating these terms.</p>
<h3>7. Contact</h3>
<p>kontakt@vehiq.pl</p>""",
    },
    {
        "slug": "cookie-policy",
        "title_pl": "Polityka Cookies",
        "title_en": "Cookie Policy",
        "content_pl": """<h2>Polityka Cookies VEHIQ</h2>
<h3>Czym są pliki cookies</h3>
<p>To małe pliki tekstowe zapisywane przez przeglądarkę. Używamy ich w trzech kategoriach:</p>
<h3>Kategorie cookies</h3>
<ul>
<li><strong>Niezbędne</strong> — sesja, autoryzacja. Nie można wyłączyć.</li>
<li><strong>Analityczne</strong> — anonimowe statystyki ruchu. Wymagają zgody.</li>
<li><strong>Marketingowe</strong> — personalizacja treści. Wymagają zgody.</li>
</ul>
<h3>Jak wyłączyć</h3>
<p>Możesz w każdej chwili zmienić ustawienia w banerze cookies lub w ustawieniach przeglądarki.</p>""",
        "content_en": """<h2>VEHIQ Cookie Policy</h2>
<h3>What are cookies</h3>
<p>Small text files stored by your browser. We use them in three categories:</p>
<h3>Cookie categories</h3>
<ul>
<li><strong>Necessary</strong> — session, authentication. Cannot be disabled.</li>
<li><strong>Analytics</strong> — anonymous traffic statistics. Require consent.</li>
<li><strong>Marketing</strong> — content personalization. Require consent.</li>
</ul>
<h3>How to disable</h3>
<p>You can change settings in the cookie banner or in your browser settings.</p>""",
    },
    {
        "slug": "marketplace-terms",
        "title_pl": "Regulamin Marketplace",
        "title_en": "Marketplace Terms",
        "content_pl": """<h2>Regulamin Marketplace VEHIQ</h2>
<h3>1. Charakter platformy</h3>
<p>VEHIQ Marketplace to platforma C2C łącząca sprzedających i kupujących. VEHIQ <strong>nie jest stroną transakcji</strong>.</p>
<h3>2. Sprzedający</h3>
<ul><li>Zapewnia prawdziwość opisu i zdjęć.</li>
<li>Posiada prawo do oferowanego przedmiotu.</li>
<li>Reaguje na wiadomości w rozsądnym czasie.</li></ul>
<h3>3. Kupujący</h3>
<ul><li>Sprawdza pojazd przed zakupem.</li>
<li>Ustala warunki płatności bezpośrednio ze sprzedającym.</li></ul>
<h3>4. Zakazane przedmioty</h3>
<p>Kradzione pojazdy, części niespełniające norm, towary objęte ograniczeniami prawnymi.</p>
<h3>5. Odpowiedzialność VEHIQ</h3>
<p>Platforma zapewnia infrastrukturę. Nie odpowiada za jakość, autentyczność ani realizację transakcji.</p>""",
        "content_en": """<h2>VEHIQ Marketplace Terms</h2>
<h3>1. Platform nature</h3>
<p>VEHIQ Marketplace is a C2C platform connecting sellers and buyers. VEHIQ <strong>is not a party to transactions</strong>.</p>
<h3>2. Sellers</h3>
<ul><li>Ensure accurate descriptions and photos.</li>
<li>Have the right to sell the offered item.</li>
<li>Respond to messages in reasonable time.</li></ul>
<h3>3. Buyers</h3>
<ul><li>Inspect the vehicle before purchase.</li>
<li>Arrange payment directly with the seller.</li></ul>
<h3>4. Prohibited items</h3>
<p>Stolen vehicles, non-compliant parts, legally restricted goods.</p>
<h3>5. VEHIQ liability</h3>
<p>The platform provides infrastructure. It is not liable for quality, authenticity or transaction completion.</p>""",
    },
    {
        "slug": "contact",
        "title_pl": "Kontakt",
        "title_en": "Contact",
        "content_pl": """<h2>Skontaktuj się z VEHIQ</h2>
<p><strong>Firma:</strong> VEHIQ</p>
<p><strong>E-mail:</strong> <a href="mailto:kontakt@vehiq.pl">kontakt@vehiq.pl</a></p>
<p><strong>Strona:</strong> <a href="https://vehiq.pl">https://vehiq.pl</a></p>
<p><strong>Czas odpowiedzi:</strong> do 48h w dni robocze.</p>""",
        "content_en": """<h2>Contact VEHIQ</h2>
<p><strong>Company:</strong> VEHIQ</p>
<p><strong>Email:</strong> <a href="mailto:kontakt@vehiq.pl">kontakt@vehiq.pl</a></p>
<p><strong>Website:</strong> <a href="https://vehiq.pl">https://vehiq.pl</a></p>
<p><strong>Response time:</strong> up to 48h on business days.</p>""",
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
    await db.listings.create_index([("make", 1), ("model", 1)])
    await db.services.create_index("slug", sparse=True)
    await db.services.create_index([("location.lat", 1), ("location.lng", 1)])
    await db.events.create_index("slug", sparse=True)
    await db.events.create_index("date_start")
    await db.events.create_index([("location.lat", 1), ("location.lng", 1)])

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
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@vehiq.app").lower()
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
