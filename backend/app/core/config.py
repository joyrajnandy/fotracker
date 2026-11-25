from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List, Union
import json


class Settings(BaseSettings):
    # App
    APP_NAME: str = "FO Tracker"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False

    # Database (lightweight SQLite with WAL mode, or PostgreSQL URL)
    DATABASE_URL: str = "sqlite:///./data/fotracker.db"

    # JWT
    SECRET_KEY: str = "change-this-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Initial Admin (created on first-ever deployment when users table is empty)
    ADMIN_USERNAME: str = "admin"
    ADMIN_EMAIL: str = "admin@fotracker.local"
    ADMIN_PASSWORD: str = "Admin@12345"
    ADMIN_FULL_NAME: str = "System Admin"

    # CORS (accepts JSON list, comma-separated string, or empty string)
    CORS_ORIGINS: Union[List[str], str] = ["http://localhost:5173", "http://localhost:3000"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            return ["http://localhost:5173", "http://localhost:3000"]
        if isinstance(v, str):
            s = v.strip()
            if s.startswith("["):
                return json.loads(s)
            return [item.strip() for item in s.split(",") if item.strip()]
        return v

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
