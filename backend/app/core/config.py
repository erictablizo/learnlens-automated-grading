from pydantic_settings import BaseSettings
from typing import List
 
 
class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:learnlens123@localhost:5432/learnlens_automated_grading"
    SECRET_KEY: str = "learnlens-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    UPLOAD_DIR: str = "uploads"
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://192.168.254.127:3000"]
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}
 
 
settings = Settings()