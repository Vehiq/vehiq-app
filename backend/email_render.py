"""Jinja2 e-mail templates (backend/email_templates): render + send in the user's language."""
import json
import os
from pathlib import Path

import html2text
from jinja2 import Environment, FileSystemLoader, select_autoescape

TPL_DIR = Path(__file__).parent / "email_templates"
_env = Environment(loader=FileSystemLoader(str(TPL_DIR)), autoescape=select_autoescape(["html"]))
SUBJECTS = json.loads((TPL_DIR / "subjects.json").read_text(encoding="utf-8"))
SITES = {"pl": "https://sharago.pl", "en": "https://sharago.com"}
UNSUB_TEMPLATES = {"reminder", "new_message", "workshop_access_request"}
TEMPLATES = ["verify_email", "welcome", "password_reset", "password_changed", "reminder",
             "new_message", "workshop_access_request", "smtp_test"]


def lang_of(user_or_lang) -> str:
    v = user_or_lang.get("language") if isinstance(user_or_lang, dict) else user_or_lang
    return "en" if v == "en" else "pl"


def app_url(lang: str) -> str:
    return SITES[lang_of(lang)]


def _subject(key: str, lang: str, fmt: dict) -> tuple[str, str]:
    s = SUBJECTS[lang][key]
    return s["subject"].format(**fmt), s["preheader"].format(**fmt)


def to_text(html: str) -> str:
    h = html2text.HTML2Text()
    h.ignore_images = True
    h.body_width = 0
    return h.handle(html).strip()


def render(name: str, lang: str, *, subject: str | None = None, preheader: str = "",
           subject_fmt: dict | None = None, **ctx) -> tuple[str, str, str]:
    """Returns (subject, html, text). `name` is a template in email_templates/<lang>/ or 'generic'."""
    lang = lang_of(lang)
    if subject is None:
        key = name
        if name == "reminder":
            key = "reminder_single" if len(ctx.get("items") or []) == 1 else "reminder_multi"
        subject, preheader = _subject(key, lang, subject_fmt or {})
    base = SITES[lang]
    if name not in UNSUB_TEMPLATES:
        ctx.pop("unsubscribe_url", None)
    common = {
        "lang": lang, "subject": subject, "preheader": preheader, "app_url": base,
        "app_domain": base.split("//", 1)[1], "privacy_url": f"{base}/legal/privacy-policy",
        "logo_url": f"{base}/email/logo.png", "user_name": ctx.pop("user_name", None) or "",
    }
    path = "generic.html" if name == "generic" else f"{lang}/{name}.html"
    html = _env.get_template(path).render(**common, **ctx)
    return subject, html, to_text(html)


def days_text(days_left: int, lang: str) -> str:
    if lang == "en":
        return "today" if days_left <= 0 else "tomorrow" if days_left == 1 else f"in {days_left} days"
    return "dziś" if days_left <= 0 else "jutro" if days_left == 1 else f"za {days_left} dni"


def sample(name: str, lang: str) -> dict:
    """Example data for admin previews."""
    en = lang == "en"
    base = SITES[lang]
    items = [{"type_label": "MOT / inspection" if en else "Przegląd techniczny", "vehicle_name": "Volkswagen Golf",
              "due_date": "29.11.2026", "days_left": 7}]
    data = {
        "verify_email": {"verify_url": f"{base}/verify?token=example", "expires_hours": 24},
        "welcome": {"add_car_url": f"{base}/garage/new"},
        "password_reset": {"reset_url": f"{base}/password-reset/confirm?token=example"},
        "password_changed": {"changed_at": "22.11.2026 at 14:05" if en else "22.11.2026 o 14:05", "reset_url": f"{base}/password-reset"},
        "reminder": {"items": items, "reminders_url": f"{base}/garage", "unsubscribe_url": f"{base}/#unsubscribe-example"},
        "new_message": {"sender_name": "Anna", "listing_title": "BMW E46 330i", "thread_url": f"{base}/marketplace/messages",
                        "unsubscribe_url": f"{base}/#unsubscribe-example"},
        "workshop_access_request": {"workshop_name": "Auto Serwis Kowalski", "vehicle_name": "Volkswagen Golf",
                                    "request_url": f"{base}/garage", "unsubscribe_url": f"{base}/#unsubscribe-example"},
        "smtp_test": {"sent_at": "22.11.2026 14:05", "from_email": os.environ.get("SMTP_FROM_EMAIL") or "noreply@sharago.com"},
    }[name]
    fmt = {
        "reminder": {"type_label": items[0]["type_label"], "vehicle_name": items[0]["vehicle_name"],
                     "due_date": items[0]["due_date"], "days_text": days_text(7, lang)},
        "new_message": {"listing_title": "BMW E46 330i", "sender_name": "Anna"},
        "workshop_access_request": {"workshop_name": "Auto Serwis Kowalski", "vehicle_name": "Volkswagen Golf"},
    }.get(name, {})
    return {"ctx": data, "fmt": fmt}
