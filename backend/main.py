from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
import asyncio
from sqlalchemy import text
from app.core.config import settings
from app.core.database import Base, engine, SessionLocal
from app.core.security import get_password_hash
from app.models import user as _user_mod, trade as _trade_mod, investment as _inv_mod, interest as _int_mod, target as _tgt_mod, broker_cash as _bc_mod  # noqa: F401
from app.models.brokerage import BrokerageSetting  # noqa: F401
from app.models.user import User
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
    conn.execute(text("ALTER TABLE brokerage_settings ALTER COLUMN per_trade_fee SET DEFAULT 25.70"))
    conn.execute(text("UPDATE brokerage_settings SET per_trade_fee = 25.70 WHERE per_trade_fee = 69.00 AND custom_total_brokerage IS NULL"))
    # Ensure at least the first registered user is admin if none exists
    conn.execute(text("""
        UPDATE users SET is_admin = TRUE
        WHERE id = (SELECT MIN(id) FROM users)
          AND NOT EXISTS (SELECT 1 FROM users WHERE is_admin = TRUE)
    """))

# First-deployment bootstrap: if users table is completely empty, create initial Admin user
with SessionLocal() as db:
    if db.query(User).count() == 0:
        admin_user = User(
            username=settings.ADMIN_USERNAME,
            email=settings.ADMIN_EMAIL,
            hashed_password=get_password_hash(settings.ADMIN_PASSWORD),
            full_name=settings.ADMIN_FULL_NAME,
            is_active=True,
            is_admin=True,
        )
        db.add(admin_user)
        db.commit()
        logger.info("Initial admin user '%s' created on first deployment.", settings.ADMIN_USERNAME)

@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.api.v1.market import run_background_webhook_feeder
    feeder_task = asyncio.create_task(run_background_webhook_feeder())
    try:
        yield
    finally:
        feeder_task.cancel()


app = FastAPI(
    title=settings.APP_NAME,
    description="F&O Trading Portfolio Tracker — Enterprise API",
    version="1.0.0",
    lifespan=lifespan,
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


app.add_middleware(GZipMiddleware, minimum_size=500)

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
