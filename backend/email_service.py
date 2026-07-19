"""Email service — Brevo HTTP API (primary, Render Free compatible) with SMTP fallback.

Render Free blocks outbound SMTP ports (25/465/587). The Brevo HTTP API uses
plain HTTPS on 443 which is always allowed. SMTP path is kept as fallback for
self-hosting / non-Render deployments.
"""
import os
import asyncio
import html as html_lib
import logging
from typing import Optional
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import aiosmtplib
import httpx

from db_helper import get_db

logger = logging.getLogger(__name__)
APP_URL = os.environ.get("APP_URL", "https://sharago.pl")
BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


async def _get_smtp_config():
    """Load email config (Brevo HTTP API key + SMTP fallback) from MongoDB."""
    db = get_db()
    cfg = await db.api_keys.find_one({"id": "default"}, {"_id": 0}) or {}
    # BREVO_API_KEY from env takes priority over DB (12-factor)
    brevo_api_key = os.environ.get("BREVO_API_KEY") or cfg.get("brevo_api_key")
    return {
        "brevo_api_key": brevo_api_key,
        "host": cfg.get("smtp_host") or "smtp-relay.brevo.com",
        "port": int(cfg.get("smtp_port") or 465),
        "login": cfg.get("smtp_login"),
        "password": cfg.get("smtp_password"),
        "from_name": cfg.get("smtp_from_name") or "Sharago",
        # Iter 31: sender switched to kontakt@sharago.com (verified in Brevo).
        # Earlier `noreply@sharago.com` was NOT verified there, causing Brevo to
        # silently reject outbound mail (e.g. password reset). Override via
        # admin SMTP settings (`smtp_from_email`) or `SMTP_FROM_EMAIL` env var
        # if a different verified sender is needed.
        "from_email": cfg.get("smtp_from_email") or os.environ.get("SMTP_FROM_EMAIL") or "kontakt@sharago.com",
    }


LOGO_URL = os.environ.get("EMAIL_LOGO_URL") or os.environ.get("LOGO_URL", "https://sharago.pl/logo.png")


def _wrap_html(title: str, body_html: str, lang: str = "pl", unsubscribe_url: Optional[str] = None) -> str:
    """Wrap email body in Sharago premium template (navy header + blue accents)."""
    unsub_href = unsubscribe_url or f"{APP_URL}/account/notifications"
    privacy_href = f"{APP_URL}/legal/privacy-policy"
    if lang == "en":
        team_line = "Sharago team"
        unsub_label = "Unsubscribe from notifications"
        privacy_label = "Privacy policy"
    else:
        team_line = "Zespół Sharago"
        unsub_label = "Wypisz się z powiadomień"
        privacy_label = "Polityka prywatności"
    return f"""<!doctype html>
<html lang="{lang}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f8;font-family:Arial,Helvetica,sans-serif;color:#222;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f8;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#0D1626;border-radius:8px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 2px 12px rgba(13,22,38,0.12);">
      <!-- Header -->
      <tr><td style="padding:24px;text-align:center;border-bottom:1px solid #1E3A5F;">
        <a href="{APP_URL}" style="text-decoration:none;display:inline-block;">
          <img src="{LOGO_URL}" alt="Sharago" height="50" style="display:inline-block;border:0;outline:none;height:50px;">
        </a>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:32px 24px;color:#ffffff;font-size:15px;line-height:1.6;">
        {body_html}
      </td></tr>
      <!-- Footer -->
      <tr><td style="padding:20px 24px;border-top:1px solid #1E3A5F;text-align:left;color:#8899AA;font-size:12px;">
        {team_line} &middot; <a href="{APP_URL}" style="color:#2B7FE8;text-decoration:none;">sharago.pl</a>
        <br>
        <a href="{unsub_href}" style="color:#8899AA;text-decoration:underline;">{unsub_label}</a> &middot;
        <a href="{privacy_href}" style="color:#8899AA;text-decoration:underline;">{privacy_label}</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""


def _btn(text: str, href: str) -> str:
    return f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:#2B7FE8;border-radius:6px;"><a href="{href}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-weight:600;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;">{text}</a></td></tr></table>'


# ---------- Templates (Iter 51 — refreshed copy + dark-body styles) ----------
# All templates render on a #0D1626 (navy) body — headings + copy must be
# light-colored. Buttons stay Sharago-blue (#2B7FE8) via _btn().
_H2 = 'font-family:Georgia,serif;color:#ffffff;font-size:26px;margin:0 0 12px;'
_P = 'color:#DCE5F0;font-size:15px;line-height:1.6;margin:0 0 14px;'
_MUTE = 'color:#8899AA;font-size:13px;line-height:1.5;margin:0;'
_QUOTE = 'border-left:3px solid #2B7FE8;margin:12px 0;padding:8px 14px;color:#DCE5F0;background:#1E3A5F;border-radius:4px;'


def tpl_welcome(name: str, lang: str = "pl"):
    name = html_lib.escape(name or "")
    if lang == "en":
        subject = "Welcome to Sharago — your virtual garage is ready"
        body = f"""<h2 style="{_H2}">Welcome, {name}!</h2>
<p style="{_P}">Your virtual garage is waiting for its first vehicle. Add it now and join the first 100 Founding Members of Sharago.</p>
{_btn("Add first vehicle →", f"{APP_URL}/garage/new")}
<p style="{_MUTE}">Founding Members get lifetime access to premium features. Only 100 spots.</p>"""
    else:
        subject = "Witaj w Sharago — Twój wirtualny garaż gotowy 🚗"
        body = f"""<h2 style="{_H2}">Cześć, {name}!</h2>
<p style="{_P}">Twój wirtualny garaż właśnie czeka na pierwsze auto. Dodaj je teraz i dołącz do pierwszych 100 Founding Members Sharago.</p>
{_btn("Dodaj pierwsze auto →", f"{APP_URL}/garage/new")}
<p style="{_MUTE}">Founding Members otrzymują dożywotni dostęp do funkcji premium. Tylko 100 miejsc.</p>"""
    return subject, _wrap_html(subject, body, lang)


def tpl_password_reset(reset_url: str, lang: str = "pl"):
    if lang == "en":
        subject = "Sharago — Password reset"
        body = f"""<h2 style="{_H2}">Password reset</h2>
<p style="{_P}">We received a request to reset your password. Click below to set a new one. Link expires in <strong style="color:#ffffff;">1 hour</strong>.</p>
{_btn("Set new password →", reset_url)}
<p style="{_MUTE}">If this wasn't you — ignore this message. Your current password stays unchanged.</p>"""
    else:
        subject = "Reset hasła Sharago"
        body = f"""<h2 style="{_H2}">Reset hasła</h2>
<p style="{_P}">Otrzymaliśmy prośbę o reset hasła. Kliknij poniżej żeby ustawić nowe. Link wygasa za <strong style="color:#ffffff;">1 godzinę</strong>.</p>
{_btn("Ustaw nowe hasło →", reset_url)}
<p style="{_MUTE}">Jeśli to nie Ty — zignoruj tę wiadomość. Twoje hasło pozostaje bez zmian.</p>"""
    return subject, _wrap_html(subject, body, lang)


def tpl_service_reminder(vehicle_label: str, reminder_type: str, due_date: str, lang: str = "pl", vehicle_id: str = ""):
    vehicle_label = html_lib.escape(vehicle_label or "")
    reminder_type = html_lib.escape(reminder_type or "")
    due_date = html_lib.escape(due_date or "")
    history_url = f"{APP_URL}/garage/{vehicle_id}" if vehicle_id else f"{APP_URL}/garage"
    if lang == "en":
        subject = f"Your {vehicle_label} needs attention 🔧"
        body = f"""<h2 style="{_H2}">Your {vehicle_label} needs attention</h2>
<p style="{_P}">Your <strong style="color:#ffffff;">{vehicle_label}</strong> has an overdue service: <strong style="color:#ffffff;">{reminder_type}</strong> (due {due_date}). Book a workshop visit.</p>
{_btn("See service history →", history_url)}"""
    else:
        subject = f"Twój {vehicle_label} wymaga uwagi 🔧"
        body = f"""<h2 style="{_H2}">Twój {vehicle_label} wymaga uwagi</h2>
<p style="{_P}">Twój <strong style="color:#ffffff;">{vehicle_label}</strong> ma zaległy serwis: <strong style="color:#ffffff;">{reminder_type}</strong> (termin: {due_date}). Zaplanuj wizytę w warsztacie.</p>
{_btn("Zobacz historię serwisową →", history_url)}"""
    return subject, _wrap_html(subject, body, lang)


def tpl_new_message(sender_name: str, listing_title: str, preview: str, listing_id: str, sender_id: str, lang: str = "pl"):
    sender_name = html_lib.escape(sender_name or "")
    listing_title = html_lib.escape(listing_title or "")
    preview = html_lib.escape(preview or "")
    reply_url = f"{APP_URL}/marketplace/messages?listing={listing_id}&user={sender_id}"
    if lang == "en":
        subject = "You have a new message on Sharago 💬"
        body = f"""<h2 style="{_H2}">You have a new message</h2>
<p style="{_P}"><strong style="color:#ffffff;">{sender_name}</strong> wrote to you about the listing "<em style="color:#ffffff;">{listing_title}</em>".</p>
<blockquote style="{_QUOTE}">{preview}</blockquote>
{_btn("Reply →", reply_url)}"""
    else:
        subject = "Masz nową wiadomość w Sharago 💬"
        body = f"""<h2 style="{_H2}">Masz nową wiadomość</h2>
<p style="{_P}"><strong style="color:#ffffff;">{sender_name}</strong> napisał/a do Ciebie w sprawie ogłoszenia "<em style="color:#ffffff;">{listing_title}</em>".</p>
<blockquote style="{_QUOTE}">{preview}</blockquote>
{_btn("Odpowiedz →", reply_url)}"""
    return subject, _wrap_html(subject, body, lang)


def tpl_forum_reply(thread_title: str, replier_name: str, preview: str, thread_id: str, lang: str = "pl"):
    replier_name = html_lib.escape(replier_name or "")
    thread_title = html_lib.escape(thread_title or "")
    preview = html_lib.escape(preview or "")
    if lang == "en":
        subject = "Someone replied to your post on Sharago"
        body = f"""<h2 style="{_H2}">New reply on your post</h2>
<p style="{_P}"><strong style="color:#ffffff;">{replier_name}</strong> replied to your post "<em style="color:#ffffff;">{thread_title}</em>".</p>
<blockquote style="{_QUOTE}">{preview}</blockquote>
{_btn("See reply →", f"{APP_URL}/forum/{thread_id}")}"""
    else:
        subject = "Ktoś odpowiedział na Twój post w Sharago"
        body = f"""<h2 style="{_H2}">Nowa odpowiedź na Twój post</h2>
<p style="{_P}"><strong style="color:#ffffff;">{replier_name}</strong> odpowiedział/a na Twój post "<em style="color:#ffffff;">{thread_title}</em>".</p>
<blockquote style="{_QUOTE}">{preview}</blockquote>
{_btn("Zobacz odpowiedź →", f"{APP_URL}/forum/{thread_id}")}"""
    return subject, _wrap_html(subject, body, lang)


def tpl_swap_match(other_name: str, other_vehicle: str, my_vehicle: str, lang: str = "pl"):
    """Iter 51: emitted on a mutual swap interest match."""
    other_name = html_lib.escape(other_name or "")
    other_vehicle = html_lib.escape(other_vehicle or "")
    my_vehicle = html_lib.escape(my_vehicle or "")
    if lang == "en":
        subject = "You found a swap partner! 🤝"
        body = f"""<h2 style="{_H2}">You found a swap partner!</h2>
<p style="{_P}"><strong style="color:#ffffff;">{other_name}</strong> is interested in swapping their <strong style="color:#ffffff;">{other_vehicle}</strong> for your <strong style="color:#ffffff;">{my_vehicle}</strong>. Message them and start the conversation.</p>
{_btn("Message now →", f"{APP_URL}/zamiany")}"""
    else:
        subject = "Znalazłeś partnera do zamiany! 🤝"
        body = f"""<h2 style="{_H2}">Znalazłeś partnera do zamiany!</h2>
<p style="{_P}"><strong style="color:#ffffff;">{other_name}</strong> jest zainteresowany/a zamianą swojego <strong style="color:#ffffff;">{other_vehicle}</strong> na Twojego <strong style="color:#ffffff;">{my_vehicle}</strong>. Napisz do niego/niej i zacznijcie rozmawiać.</p>
{_btn("Napisz teraz →", f"{APP_URL}/zamiany")}"""
    return subject, _wrap_html(subject, body, lang)


def tpl_account_deleted(name: str, lang: str = "pl"):
    """Iter 51: emitted on soft-delete — 30-day restore window."""
    name = html_lib.escape(name or "")
    if lang == "en":
        subject = "Your Sharago account has been deleted"
        body = f"""<h2 style="{_H2}">Account deleted</h2>
<p style="{_P}">Hi {name}, your account has been deleted. You have <strong style="color:#ffffff;">30 days</strong> to restore it if you change your mind. After that, all data will be permanently erased.</p>
{_btn("Restore account →", f"{APP_URL}/account/restore")}
<p style="{_MUTE}">If you didn't request this, contact us immediately at kontakt@sharago.pl.</p>"""
    else:
        subject = "Twoje konto Sharago zostało usunięte"
        body = f"""<h2 style="{_H2}">Konto usunięte</h2>
<p style="{_P}">Cześć {name}, Twoje konto zostało usunięte. Masz <strong style="color:#ffffff;">30 dni</strong> na przywrócenie konta jeśli zmienisz zdanie. Po tym czasie wszystkie dane zostaną trwale usunięte.</p>
{_btn("Przywróć konto →", f"{APP_URL}/account/restore")}
<p style="{_MUTE}">Jeśli to nie Ty — skontaktuj się z nami pod adresem kontakt@sharago.pl.</p>"""
    return subject, _wrap_html(subject, body, lang)


def tpl_test(lang: str = "pl"):
    if lang == "en":
        subject = "Sharago — SMTP test"
        body = f"""<h2 style="{_H2}">SMTP test successful ✓</h2>
<p style="{_P}">If you received this email, your Sharago SMTP configuration is working correctly.</p>"""
    else:
        subject = "Sharago — Test SMTP"
        body = f"""<h2 style="{_H2}">Test SMTP udany ✓</h2>
<p style="{_P}">Jeśli otrzymałeś tego maila, konfiguracja SMTP w Sharago działa poprawnie.</p>"""
    return subject, _wrap_html(subject, body, lang)


# ---------- Sender ----------
async def send_email(to: str, subject: str, html: str) -> tuple[bool, str]:
    """Send email — Brevo HTTP API (primary) or SMTP (fallback).

    Brevo HTTP API works over HTTPS:443 (allowed on Render Free).
    SMTP fallback is used only when BREVO_API_KEY is NOT configured.

    Returns (ok, error_message_or_empty).
    """
    cfg = await _get_smtp_config()

    # ─── Path 1: Brevo HTTP API ───
    if cfg["brevo_api_key"]:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                r = await client.post(
                    BREVO_API_URL,
                    headers={
                        "api-key": cfg["brevo_api_key"],
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                    },
                    json={
                        "sender": {"name": cfg["from_name"], "email": cfg["from_email"]},
                        "to": [{"email": to}],
                        "subject": subject,
                        "htmlContent": html,
                    },
                )
            if 200 <= r.status_code < 300:
                msg_id = (r.json() or {}).get("messageId", "?")
                logger.info(f"BREVO API OK → {to} ({subject!r}) messageId={msg_id}")
                return True, ""
            else:
                err = f"HTTP {r.status_code}: {r.text[:200]}"
                logger.error(f"BREVO API FAIL → {to} ({subject!r}) {err}")
                return False, err
        except Exception as e:
            logger.error(f"BREVO API EXC → {to} ({subject!r}) {type(e).__name__}: {e}")
            return False, f"{type(e).__name__}: {str(e)[:200]}"

    # ─── Path 2: SMTP fallback (no API key configured) ───
    if not cfg["host"] or not cfg["login"] or not cfg["password"]:
        logger.warning(f"Email not configured (no BREVO_API_KEY, no SMTP) — skipped {to} ({subject!r})")
        return False, "Email not configured. Set BREVO_API_KEY (recommended) or SMTP credentials in admin panel."

    msg = MIMEMultipart("alternative")
    msg["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText("(This email requires HTML rendering)", "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    logger.info(f"SMTP fallback send → to={to} subject={subject!r} via {cfg['host']}:{cfg['port']}")
    try:
        if cfg["port"] == 465:
            await aiosmtplib.send(msg, hostname=cfg["host"], port=cfg["port"], username=cfg["login"], password=cfg["password"], use_tls=True, start_tls=False, timeout=20)
        else:
            await aiosmtplib.send(msg, hostname=cfg["host"], port=cfg["port"], username=cfg["login"], password=cfg["password"], use_tls=False, start_tls=True, timeout=20)
        logger.info(f"SMTP OK → {to} ({subject!r})")
        return True, ""
    except Exception as e:
        logger.error(f"SMTP FAIL → {to} ({subject!r}) via {cfg['host']}:{cfg['port']}: {type(e).__name__}: {e}")
        return False, f"{type(e).__name__}: {str(e)[:200]}"


def fire_and_forget(coro):
    """Run async email send without blocking caller. Errors logged, never raised."""
    async def _wrap():
        try:
            await coro
        except Exception as e:
            logger.warning(f"Email task error: {e}")
    asyncio.create_task(_wrap())



# ─────────────────────────────────────────────────────────────────────────────
# Iter 31 — Notification throttling
#
# Goal: stop flooding users (and the admin) with reminder/notification emails.
# Each (user_id, email_type) pair may receive at most one email per 168h (7 d).
# Transactional emails (welcome, password_reset, email_verification) bypass
# this and the global toggle — they must always go out.
#
# A global on/off toggle lives in `app_settings.notification_emails_enabled`
# (admin-controlled). Default = ON.
# ─────────────────────────────────────────────────────────────────────────────
from datetime import datetime, timezone, timedelta

NOTIFICATION_COOLDOWN_HOURS = 168  # 7 days
TRANSACTIONAL_TYPES = {"welcome", "password_reset", "email_verification", "smtp_test", "admin_password_reset"}


async def notifications_enabled() -> bool:
    """Global admin kill-switch for non-transactional notification emails."""
    try:
        db = get_db()
        doc = await db.app_settings.find_one({"key": "notification_emails_enabled"})
        if not doc:
            return True  # default ON
        v = doc.get("value")
        return str(v).lower() not in ("false", "0", "off", "no")
    except Exception:
        return True


async def _within_cooldown(user_id: str, email_type: str) -> bool:
    """Return True if a same-type email was sent to this user within cooldown window."""
    try:
        db = get_db()
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=NOTIFICATION_COOLDOWN_HOURS)).isoformat()
        recent = await db.email_log.find_one(
            {"user_id": user_id, "email_type": email_type, "sent_at": {"$gt": cutoff}},
            {"_id": 1},
        )
        return recent is not None
    except Exception as e:
        logger.warning(f"email cooldown lookup failed (allowing send): {e}")
        return False


async def _log_email_sent(user_id: str, email_type: str, to: str) -> None:
    try:
        db = get_db()
        await db.email_log.insert_one({
            "user_id": user_id,
            "email_type": email_type,
            "to": to,
            "sent_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.warning(f"email_log insert failed: {e}")


async def send_notification(user_id: str, email_type: str, to: str, subject: str, html: str) -> tuple[bool, str]:
    """Send a non-transactional notification email, honoring rate limit + admin toggle.

    Returns (ok, reason_if_skipped_or_empty).
    """
    if email_type in TRANSACTIONAL_TYPES:
        # Caller misuse — transactional should go via send_email directly.
        logger.info(f"send_notification called for transactional type {email_type!r}; forwarding without throttle")
        return await send_email(to, subject, html)

    if not await notifications_enabled():
        logger.info(f"NOTIF skipped (globally disabled): user={user_id} type={email_type} to={to}")
        return False, "notifications_disabled"

    if user_id and await _within_cooldown(user_id, email_type):
        logger.info(f"NOTIF skipped (cooldown 7d): user={user_id} type={email_type} to={to}")
        return False, "cooldown"

    ok, err = await send_email(to, subject, html)
    if ok and user_id:
        await _log_email_sent(user_id, email_type, to)
    return ok, err
