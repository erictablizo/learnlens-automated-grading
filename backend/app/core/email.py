"""
app/core/email.py
=================
Email sending utility for password reset and other notifications.
"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings


async def send_password_reset_email(
    email: str,
    token: str,
    reset_url: str,
) -> None:
    """
    Send password reset email to user.
    
    Args:
        email: User's email address
        token: Password reset token
        reset_url: Full URL for password reset link
    """
    try:
        # Create message
        message = MIMEMultipart("alternative")
        message["Subject"] = "LearnLens Password Reset"
        message["From"] = settings.SMTP_FROM_EMAIL
        message["To"] = email

        # HTML email body
        html_body = f"""
        <html>
          <body style="font-family: Arial, sans-serif; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #0a1428;">Password Reset Request</h2>
              <p>Hello,</p>
              <p>We received a request to reset your LearnLens password. Click the button below to proceed:</p>
              <p style="margin-top: 25px;">
                <a href="{reset_url}" style="display: inline-block; padding: 12px 30px; background-color: #ff9500; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
                  Reset Password
                </a>
              </p>
              <p style="font-size: 12px; color: #999; margin-top: 30px;">
                Or copy and paste this link in your browser:
                <br><code style="background: #f5f5f5; padding: 5px 10px; border-radius: 3px; word-break: break-all;">{reset_url}</code>
              </p>
              <p style="font-size: 12px; color: #999; margin-top: 20px;">
                This link expires in 1 hour.
              </p>
              <p style="font-size: 12px; color: #999; margin-top: 20px;">
                If you didn't request this, please ignore this email.
              </p>
              <hr style="border: none; border-top: 1px solid #ddd; margin-top: 40px;">
              <p style="font-size: 11px; color: #ccc; text-align: center;">
                LearnLens © 2026
              </p>
            </div>
          </body>
        </html>
        """

        # Plain text fallback
        text_body = f"""
        Password Reset Request
        
        Hello,
        
        We received a request to reset your LearnLens password.
        
        Click this link to reset: {reset_url}
        
        This link expires in 1 hour.
        
        If you didn't request this, please ignore this email.
        
        LearnLens © 2026
        """

        # Attach both versions
        part1 = MIMEText(text_body, "plain")
        part2 = MIMEText(html_body, "html")
        message.attach(part1)
        message.attach(part2)

        # Send email
        with smtplib.SMTP(settings.SMTP_SERVER, settings.SMTP_PORT) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            if settings.SMTP_USER and settings.SMTP_PASSWORD:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(message)

        print(f"✓ Password reset email sent to {email}")

    except Exception as e:
        print(f"✗ Failed to send password reset email to {email}: {str(e)}")
        raise