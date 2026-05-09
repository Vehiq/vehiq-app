# UptimeRobot — Konfiguracja Monitoringu VEHIQ

Krótki przewodnik konfiguracji bezpłatnego monitoringu uptime dla backendu VEHIQ wdrożonego na Render.com. UptimeRobot regularnie pinguje endpoint zdrowia, co dodatkowo zapobiega "uśpieniu" instancji Free na Render (cold start co 15 min bezczynności).

---

## 1. Wymagania wstępne

- Wdrożony backend VEHIQ (Render lub inna platforma)
- Działający endpoint `GET /api/health` zwracający status `200 OK`
- Konto e-mail do alertów

Przykładowy URL produkcyjny:
```
https://vehiq-backend.onrender.com/api/health
```

---

## 2. Załóż konto UptimeRobot

1. Wejdź na https://uptimerobot.com/signUp
2. Zarejestruj się przez e-mail (plan Free wystarczy — 50 monitorów, interwał 5 min)
3. Potwierdź e-mail i zaloguj się

---

## 3. Dodaj nowy monitor

1. W dashboardzie kliknij **"+ New monitor"**
2. Wypełnij formularz:

| Pole | Wartość |
|------|---------|
| **Monitor Type** | `HTTP(s)` |
| **Friendly Name** | `VEHIQ Backend Health` |
| **URL** | `https://vehiq-backend.onrender.com/api/health` |
| **Monitoring Interval** | `5 minutes` (Free) |
| **Monitor Timeout** | `30 seconds` (Render cold start może trwać dłużej) |
| **HTTP Method** | `GET` |

3. (Opcjonalnie) **Advanced Settings** → **Keyword Monitoring**:
   - Keyword Type: `exists`
   - Keyword: `ok` (jeśli `/api/health` zwraca `{"status": "ok"}`)

4. Kliknij **Create Monitor**.

---

## 4. Konfiguracja powiadomień (Alert Contacts)

1. Lewe menu → **My Settings** → **Alert Contacts** → **+ Add Alert Contact**
2. Wybierz typ:
   - **E-mail** — najprostszy
   - **Slack / Discord / Telegram Webhook** — dla zespołu
3. Podaj adres / webhook i zapisz.
4. Wróć do swojego monitora → **Edit** → przypisz utworzony Alert Contact.

Domyślnie alert wyśle się gdy:
- Monitor jest **DOWN** przez ≥ 1 cykl
- Monitor wraca **UP** (recovery)

---

## 5. (Opcjonalnie) Dodatkowe monitory

Dla pełnej obserwowalności VEHIQ zalecamy:

| Nazwa | URL | Po co? |
|-------|-----|--------|
| `VEHIQ Frontend` | `https://vehiq.vercel.app` | Sprawdza, czy SPA się ładuje |
| `VEHIQ AI Endpoint` | `https://...onrender.com/api/ai/status` | Sprawdza dostępność klucza Anthropic |
| `VEHIQ Search` | `https://...onrender.com/api/search?q=test` | Sprawdza pełen flow MongoDB + API |

---

## 6. Public Status Page (opcjonalne, ale fajne)

1. Lewe menu → **Status Pages** → **+ Add Status Page**
2. Nadaj nazwę (np. `VEHIQ Status`) i custom URL: `vehiq.statuspage.uptimerobot.com`
3. Wybierz monitory do publicznego pokazania
4. Skopiuj link i osadź np. w stopce `vehiq.pl/status`

---

## 7. Render Free + Cold Start — uwaga

Render Free usypia kontener po 15 min bezczynności. UptimeRobot pingujący co 5 min skutecznie utrzymuje go w stanie aktywnym 24/7. Jeśli zauważysz fałszywe alerty z timeoutem, zwiększ **Monitor Timeout** do 60 s — pierwsze pingnięcie po cold start może trwać ~30–50 s.

---

## 8. Weryfikacja

- Wejdź na zakładkę monitora → status powinien być `Up` (zielony) w ciągu kilku minut
- Wyłącz tymczasowo backend → po 5–10 min powinieneś dostać alert mailowy
- Włącz z powrotem → recovery alert

Gotowe. Masz teraz darmowy 24/7 monitoring produkcji VEHIQ. 🚀
