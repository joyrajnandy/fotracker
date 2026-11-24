from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.core.config import settings
from app.core.database import Base, engine
from app.models.brokerage import BrokerageSetting  # noqa: F401
from app.api.v1.router import api_router
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Auto-create tables on startup
Base.metadata.create_all(bind=engine)

# Safe schema evolution for existing DBs
with engine.begin() as conn:
    conn.execute(text("ALTER TABLE investments ADD COLUMN IF NOT EXISTS current_value NUMERIC(15, 2)"))
    conn.execute(text("ALTER TABLE investments ADD COLUMN IF NOT EXISTS instrument_code VARCHAR(60)"))
    conn.execute(text("ALTER TABLE investments ADD COLUMN IF NOT EXISTS quantity NUMERIC(15, 4) DEFAULT 1"))
    conn.execute(text("ALTER TABLE investments ADD COLUMN IF NOT EXISTS buy_price NUMERIC(15, 4)"))
    conn.execute(text("ALTER TABLE investments ADD COLUMN IF NOT EXISTS ltp NUMERIC(15, 4)"))
    conn.execute(text("ALTER TABLE investments ALTER COLUMN investment_date DROP NOT NULL"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE"))
    # Ensure at least the first registered user is admin if none exists
    conn.execute(text("""
        UPDATE users SET is_admin = TRUE
        WHERE id = (SELECT MIN(id) FROM users)
          AND NOT EXISTS (SELECT 1 FROM users WHERE is_admin = TRUE)
    """))

app = FastAPI(
    title=settings.APP_NAME,
    description="F&O Trading Portfolio Tracker — Enterprise API",
    version="1.0.0",
    openapi_url=f"{settings.API_V1_PREFIX}/openapi.json" if settings.DEBUG else None,
    docs_url=f"{settings.API_V1_PREFIX}/docs" if settings.DEBUG else None,
    redoc_url=f"{settings.API_V1_PREFIX}/redoc" if settings.DEBUG else None,
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok", "app": settings.APP_NAME, "version": "1.0.0"}
