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


# NEW 2026-11-11. One sentence, shown to whoever pressed the button. It names
# no setting and no file, because the person reading it is a teacher who cannot
# act on either - the operator detail goes to log.error instead. See
# send_password_reset_email() below.
SEND_FAILED_MESSAGE = (
    "We could not send the reset email right now. Please try again in a few minutes."
)


def _smtp_configured() -> bool:
    return bool(settings.SMTP_HOST.strip() and settings.SMTP_USER.strip() and settings.SMTP_PASSWORD.strip())


def smtp_configured() -> bool:
    """Public name for _smtp_configured(), for callers outside this module.

    NEW 2026-11-11. routes/auth.py needs to know whether mail can actually be
    delivered, so that a request for an address with no account can be answered
    identically to one that has an account - without that, /auth/forgot-password
    reports who is registered. Importing the underscore name would work but
    would say the opposite of what the underscore means.
    """
    return _smtp_configured()


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
        # CHANGED 2026-11-11: this used to raise "Check SMTP_USER /
        # SMTP_PASSWORD (Gmail needs an App Password)". routes/auth.py puts the
        # EmailSendError text into a 503 detail and api.ts renders it, so that
        # sentence was shown TO THE TEACHER - configuration advice aimed at
        # whoever runs the server, in a modal belonging to someone who cannot
        # open .env. The advice now goes to the log, where the operator is.
        #
        # The password is NOT logged. Host and user are, because they are what
        # you check first, and neither is a secret.
        log.error(
            "SMTP login rejected by %s as %s - check SMTP_USER / SMTP_PASSWORD "
            "(Gmail needs the 16-character App Password, not the account password): %s",
            settings.SMTP_HOST.strip(), settings.SMTP_USER.strip(), e,
        )
        raise EmailSendError(SEND_FAILED_MESSAGE) from e
    except (smtplib.SMTPException, OSError) as e:
        log.error("SMTP send failed via %s: %s", settings.SMTP_HOST.strip(), e)
        raise EmailSendError(SEND_FAILED_MESSAGE) from e
    return True