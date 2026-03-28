from pydantic_settings import BaseSettings
from typing import Optional
 
 
class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:learnlens123@localhost:5432/learnlens_automated_grading"
    SECRET_KEY: str = "learnlens-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    UPLOAD_DIR: str = "uploads"
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://192.168.254.127:3000"]
 
    class Config:
        env_file = ".env"
 
 
settings = Settings()