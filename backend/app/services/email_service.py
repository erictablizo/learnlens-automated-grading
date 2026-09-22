"""
NEW 2026-09-22 — sends the Forgot Password email.

The old /auth/forgot-password endpoint created a token but never sent anything.
Uses only the Python standard library (smtplib), so no new pip packages.
"""
import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from app.core.config import settings

log = logging.getLogger("learnlens.email")


class EmailSendError(Exception):
    """Raised when SMTP is configured but the email could not be sent."""


def _smtp_configured() -> bool:
    return bool(settings.SMTP_HOST.strip() and settings.SMTP_USER.strip() and settings.SMTP_PASSWORD.strip())


def _build_message(to_email: str, reset_url: str) -> EmailMessage:
    minutes = settings.RESET_TOKEN_EXPIRE_MINUTES
    sender = settings.SMTP_FROM.strip() or settings.SMTP_USER.strip()
    msg = EmailMessage()
    msg["Subject"] = "Reset your LearnLens password"
    msg["From"] = formataddr((settings.SMTP_FROM_NAME, sender))
    msg["To"] = to_email
    msg.set_content(
        "Hi,\n\n"
        "We received a request to reset the password of your LearnLens account.\n"
        f"Open this link to choose a new password (valid for {minutes} minutes, one use only):\n\n"
        f"{reset_url}\n\n"
        "If you did not ask for this, you can ignore this email. Your password will not change.\n\n"
        "— LearnLens"
    )
    msg.add_alternative(f"""\
<html><body style="font-family:Arial,sans-serif;color:#222">
  <h2 style="color:#e8762c">Reset your LearnLens password</h2>
  <p>We received a request to reset the password of your LearnLens account.</p>
  <p><a href="{reset_url}" style="display:inline-block;padding:10px 18px;background:#e8762c;color:#fff;
     text-decoration:none;border-radius:6px">Reset password</a></p>
  <p style="font-size:13px;color:#555">This link is valid for {minutes} minutes and can be used once.<br>
     If the button does not work, copy this link:<br>{reset_url}</p>
  <p style="font-size:13px;color:#555">If you did not ask for this, ignore this email.</p>
</body></html>""", subtype="html")
    return msg


def _send_blocking(msg: EmailMessage) -> None:
    host, port = settings.SMTP_HOST.strip(), settings.SMTP_PORT
    ctx = ssl.create_default_context()
    if settings.SMTP_USE_SSL or port == 465:
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=20) as s:
            s.login(settings.SMTP_USER.strip(), settings.SMTP_PASSWORD.replace(" ", ""))
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=20) as s:
            s.ehlo()
            s.starttls(context=ctx)
            s.ehlo()
            s.login(settings.SMTP_USER.strip(), settings.SMTP_PASSWORD.replace(" ", ""))
            s.send_message(msg)


async def send_password_reset_email(to_email: str, reset_url: str) -> bool:
    """
    Returns True when the email was sent, False in DEV MODE (SMTP not configured —
    the link is printed in the terminal instead). Raises EmailSendError on SMTP failure.
    """
    if not _smtp_configured():
        banner = "=" * 70
        print(f"\n{banner}\n[DEV MODE] SMTP is not configured (backend/.env).\n"
              f"Password reset link for {to_email}:\n{reset_url}\n{banner}\n", flush=True)
        return False

    msg = _build_message(to_email, reset_url)
    try:
        await asyncio.to_thread(_send_blocking, msg)
    except smtplib.SMTPAuthenticationError as e:
        log.error("SMTP login failed: %s", e)
        raise EmailSendError("The email server rejected the login. Check SMTP_USER / SMTP_PASSWORD "
                             "(Gmail needs an App Password).") from e
    except (smtplib.SMTPException, OSError) as e:
        log.error("SMTP send failed: %s", e)
        raise EmailSendError("We could not send the reset email right now. Please try again in a few minutes.") from e
    return True