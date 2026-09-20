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
 
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    # Email configuration
    SMTP_SERVER: str = "smtp.office365.com"  # or your school's Exchange server
    SMTP_PORT: int = 587
    SMTP_USE_TLS: bool = True
    SMTP_USER: str = "eric.tablizo@dlsau.edu.ph"  # Your school email address (e.g., teacher@schooldomain.edu)
    SMTP_PASSWORD: str = "BabyEric09@@"  # Your Outlook password or app-specific password
    SMTP_FROM_EMAIL: str = "eric.tablizo@dlsau.edu.ph"  # Same as SMTP_USER
 
 
settings = Settings()