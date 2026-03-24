from pydantic_settings import BaseSettings
from typing import Optional
 
 
class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:learnlens123@localhost:5432/learnlens_automated_grading"
 
    # JWT
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
 
    # Email (for password reset)
    SMTP_HOST: Optional[str] = "smtp.gmail.com"
    SMTP_PORT: Optional[int] = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    EMAIL_FROM: Optional[str] = "noreply@learnlens.com"
 
    # App
    APP_NAME: str = "LearnLens"
    FRONTEND_URL: str = "http://localhost:3000"
 
    class Config:
        env_file = ".env"
 
 
settings = Settings()