from pydantic_settings import BaseSettings
from typing import List
 
 
class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:learnlens123@localhost:5432/learnlens_automated_grading"
    SECRET_KEY: str = "learnlens-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    UPLOAD_DIR: str = "uploads"
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
 
    # Tesseract OCR executable path (Windows only — leave empty on Linux/Mac)
    # Example: C:\Program Files\Tesseract-OCR\tesseract.exe
    TESSERACT_CMD: str = "C:\\Program Files\\Tesseract-OCR\\tesseract.exe"

    # Added on 2026-09-22: For password reset emails:
    # ── Forgot Password (FIX 2026-09-22) ──────────────────────────────────
    # Where the reset link in the email should point (your Next.js app).
    FRONTEND_URL: str = "http://localhost:3000"
    RESET_TOKEN_EXPIRE_MINUTES: int = 60
 
    # SMTP. Leave SMTP_HOST empty = DEV MODE (link is printed in the uvicorn terminal).
    # Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USER=you@gmail.com,
    #        SMTP_PASSWORD=<16-char App Password, NOT your normal password>
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""          # defaults to SMTP_USER when empty
    SMTP_FROM_NAME: str = "LearnLens"
    SMTP_USE_SSL: bool = False   # True only for port 465

    # Added on 2026-09-29: show the reset link on the "Check your email!" screen
    # while SMTP is not configured, so you do not have to copy it out of the
    # uvicorn terminal.
    #
    # SECURITY: this returns a one-use password-reset token in the HTTP
    # response, so anyone who can call /auth/forgot-password with a registered
    # email could reset that account's password. It is only ever included when
    # SMTP is NOT configured (there is no other way to deliver the link), but
    # put SHOW_DEV_RESET_LINK=False in backend/.env — or configure SMTP —
    # before the system is reachable by anyone but you. With SMTP configured
    # the link is never returned, whatever this is set to.
    SHOW_DEV_RESET_LINK: bool = True
 
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}
settings = Settings()