"""Email service — Brevo HTTP API (primary, Render Free compatible) with SMTP fallback.

Render Free blocks outbound SMTP ports (25/465/587). The Brevo HTTP API uses
plain HTTPS on 443 which is always allowed. SMTP path is kept as fallback for
self-hosting / non-Render deployments.
"""
import os
import asyncio
import html as html_lib
import logging
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


LOGO_URL = os.environ.get("EMAIL_LOGO_URL", "https://sharago.pl/logo.png")


def _wrap_html(title: str, body_html: str, lang: str = "pl") -> str:
    """Wrap email body in Sharago premium template (navy header + blue accents)."""
    footer_unsubscribe = "Możesz wypisać się z powiadomień w ustawieniach konta." if lang == "pl" else "You can unsubscribe from notifications in your account settings."
    return f"""<!doctype html>
<html lang="{lang}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f8;font-family:Arial,Helvetica,sans-serif;color:#222;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f8;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 2px 12px rgba(13,22,38,0.08);">
      <!-- Header -->
      <tr><td style="background:#0D1626;padding:28px 32px;text-align:left;">
        <a href="{APP_URL}" style="text-decoration:none;display:inline-block;">
          <img src="{LOGO_URL}" alt="Sharago" width="160" height="40" style="display:block;border:0;outline:none;max-width:160px;height:auto;">
        </a>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:36px 32px;color:#222;font-size:15px;line-height:1.6;">
        {body_html}
      </td></tr>
      <!-- Footer -->
      <tr><td style="background:#0D1626;padding:20px 32px;text-align:center;color:#9BA8C0;font-size:11px;">
        © 2026 Sharago &middot; <a href="{APP_URL}" style="color:#2B7FE8;text-decoration:none;">sharago.pl</a><br>
        <span style="color:#5C6B85;">{footer_unsubscribe}</span>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""


def _btn(text: str, href: str) -> str:
    return f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:#2B7FE8;border-radius:6px;"><a href="{href}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-weight:600;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;">{text}</a></td></tr></table>'


# ---------- Templates ----------
def tpl_welcome(name: str, lang: str = "pl"):
    name = html_lib.escape(name or "")
    if lang == "en":
        subject = "Welcome to Sharago — Your garage is ready"
        body = f"""<h2 style="font-family:Georgia,serif;color:#0D1626;font-size:28px;margin:0 0 12px;">Welcome, {name}!</h2>
<p>Your virtual garage is ready. Add your vehicles, track service history, monitor mileage, and chat with our AI Mechanic powered by Claude Sonnet 4.5.</p>
{_btn("Add your first vehicle", f"{APP_URL}/garage/new")}
<p style="color:#666;font-size:13px;">Need help? Reply to this email — we're here.</p>"""
    else:
        subject = "Witaj w Sharago — Twój garaż czeka"
        body = f"""<h2 style="font-family:Georgia,serif;color:#0D1626;font-size:28px;margin:0 0 12px;">Witaj, {name}!</h2>
<p>Twój wirtualny garaż jest gotowy. Dodawaj pojazdy, śledź historię serwisową, monitoruj przebieg i rozmawiaj z naszym AI Mechanikiem opartym o Claude Sonnet 4.5.</p>
{_btn("Dodaj pierwszy pojazd", f"{APP_URL}/garage/new")}
<p style="color:#666;font-size:13px;">Potrzebujesz pomocy? Odpisz na tego maila.</p>"""
    return subject, _wrap_html(subject, body, lang)


def tpl_password_reset(reset_url: str, lang: str = "pl"):
    if lang == "en":
        subject = "Sharago — Password reset"
        body = f"""<h2 style="font-family:Georgia,serif;color:#0D1626;font-size:26px;margin:0 0 12px;">Reset your password</h2>
<p>Click the button below to set a new password. This link is valid for <strong>1 hour</strong>.</p>
{_btn("Reset password", reset_url)}
<p style="color:#666;font-size:13px;">If you did not request this, ignore this email — your password remains unchanged.</p>"""
    else:
        subject = "Sharago — Reset hasła"
        body = f"""<h2 style="font-family:Georgia,serif;color:#0D1626;font-size:26px;margin:0 0 12px;">Resetuj hasło</h2>
<p>Kliknij przycisk poniżej, aby ustawić nowe hasło. Link jest ważny przez <strong>1 godzinę</strong>.</p>
{_btn("Resetuj hasło", reset_url)}
<p style="color:#666;font-size:13px;">Jeśli nie prosiłeś o reset, zignoruj ten email — hasło pozostaje bez zmian.</p>"""
    return subject, _wrap_html(subject, body, lang)


def tpl_service_reminder(vehicle_label: str, reminder_type: str, due_date: str, lang: str = "pl"):
    if lang == "en":
        subject = f"Your {vehicle_label} needs attention in 7 days"
        body = f"""<h2 style="font-family:Georgia,serif;color:#0D1626;font-size:26px;margin:0 0 12px;">Upcoming reminder</h2>
<p>Your <strong>{vehicle_label}</strong> has a <strong>{reminder_type}</strong> due on <strong>{due_date}</strong>.</p>
{_btn("Open in Sharago", f"{APP_URL}/garage")}"""
    else:
        subject = f"Twój {vehicle_label} wymaga uwagi za 7 dni"
        body = f"""<h2 style="font-family:Georgia,serif;color:#0D1626;font-size:26px;margin:0 0 12px;">Nadchodzące przypomnienie</h2>
<p>Twój pojazd <strong>{vehicle_label}</strong> ma zaplanowane <strong>{reminder_type}</strong> na <strong>{due_date}</strong>.</p>
{_btn("Sprawdź w Sharago", f"{APP_URL}/garage")}"""
    return subject, _wrap_html(subject, body, lang)


def tpl_new_message(sender_name: str, listing_title: str, preview: str, listing_id: str, sender_id: str, lang: str = "pl"):
    sender_name = html_lib.escape(sender_name or "")
    listing_title = html_lib.escape(listing_title or "")
    preview = html_lib.escape(preview or "")
    if lang == "en":
        subject = "You have a new message on Sharago"
        body = f"""<h2 style="font-family:Georgia,serif;color:#0D1626;font-size:26px;margin:0 0 12px;">New message from {sender_name}</h2>
<p style="color:#666;font-size:13px;">Listing: <em>{listing_title}</em></p>
<blockquote style="border-left:3px solid #2B7FE8;margin:12px 0;padding:8px 14px;color:#444;background:#fafafa;">{preview}</blockquote>
{_btn("Reply", f"{APP_URL}/marketplace/messages?listing={listing_id}&user={sender_id}")}"""
    else:
        subject = "Masz nową wiadomość w Sharago"
        body = f"""<h2 style="font-family:Georgia,serif;color:#0D1626;font-size:26px;margin:0 0 12px;">Nowa wiadomość od {sender_name}</h2>
<p style="color:#666;font-size:13px;">Ogłoszenie: <em>{listing_title}</em></p>
<blockquote style="border-left:3px solid #2B7FE8;margin:12px 0;padding:8px 14px;color:#444;background:#fafafa;">{preview}</blockquote>
{_btn("Odpowiedz", f"{APP_URL}/marketplace/messages?listing={listing_id}&user={sender_id}")}"""
    return subject, _wrap_html(subject, body, lang)


def tpl_forum_reply(thread_title: str, replier_name: str, preview: str, thread_id: str, lang: str = "pl"):
    if lang == "en":
        subject = "Someone replied to your thread"
        body = f"""<h2 style="font-family:Georgia,serif;color:#0D1626;font-size:26px;margin:0 0 12px;">{replier_name} replied</h2>
<p style="color:#666;font-size:13px;">Thread: <strong>{thread_title}</strong></p>
<blockquote style="border-left:3px solid #2B7FE8;margin:12px 0;padding:8px 14px;color:#444;background:#fafafa;">{preview}</blockquote>
{_btn("View reply", f"{APP_URL}/forum/{thread_id}")}"""
    else:
        subject = "Ktoś odpowiedział na Twój wątek"
        body = f"""<h2 style="font-family:Georgia,serif;color:#0D1626;font-size:26px;margin:0 0 12px;">{replier_name} odpowiedział</h2>
<p style="color:#666;font-size:13px;">Wątek: <strong>{thread_title}</strong></p>
<blockquote style="border-left:3px solid #2B7FE8;margin:12px 0;padding:8px 14px;color:#444;background:#fafafa;">{preview}</blockquote>
{_btn("Zobacz odpowiedź", f"{APP_URL}/forum/{thread_id}")}"""
    return subject, _wrap_html(subject, body, lang)


def tpl_test(lang: str = "pl"):
    if lang == "en":
        subject = "Sharago — SMTP test"
        body = """<h2 style="font-family:Georgia,serif;color:#0D1626;font-size:26px;margin:0 0 12px;">SMTP test successful ✓</h2>
<p>If you received this email, your Sharago SMTP configuration is working correctly.</p>"""
    else:
        subject = "Sharago — Test SMTP"
        body = """<h2 style="font-family:Georgia,serif;color:#0D1626;font-size:26px;margin:0 0 12px;">Test SMTP udany ✓</h2>
<p>Jeśli otrzymałeś tego maila, konfiguracja SMTP w Sharago działa poprawnie.</p>"""
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
