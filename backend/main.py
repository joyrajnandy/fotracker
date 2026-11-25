from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import asyncio
import os
from sqlalchemy import inspect, text
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

# Dialect-safe schema evolution (works on both SQLite and PostgreSQL)
def _ensure_column(table: str, col: str, ddl: str):
    existing = {c["name"] for c in inspect(engine).get_columns(table)}
    if col not in existing:
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))

_ensure_column("investments", "current_value", "NUMERIC(15, 2)")
_ensure_column("investments", "instrument_code", "VARCHAR(60)")
_ensure_column("investments", "quantity", "NUMERIC(15, 4) DEFAULT 1")
_ensure_column("investments", "buy_price", "NUMERIC(15, 4)")
_ensure_column("investments", "ltp", "NUMERIC(15, 4)")
_ensure_column("users", "is_admin", "BOOLEAN NOT NULL DEFAULT FALSE")

with engine.begin() as conn:
    if engine.dialect.name != "sqlite":
        conn.execute(text("ALTER TABLE investments ALTER COLUMN investment_date DROP NOT NULL"))
        conn.execute(text("ALTER TABLE brokerage_settings ALTER COLUMN per_trade_fee SET DEFAULT 20.00"))
    conn.execute(text("UPDATE brokerage_settings SET per_trade_fee = 20.00 WHERE per_trade_fee IN (69.00, 25.70) AND custom_total_brokerage IS NULL"))

# First-deployment bootstrap & admin promotion (dialect-agnostic ORM)
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
    elif db.query(User).filter(User.is_admin.is_(True)).count() == 0:
        first_user = db.query(User).order_by(User.id.asc()).first()
        if first_user:
            first_user.is_admin = True
            db.commit()

@asynccontextmanager
async def lifespan(app: FastAPI):
    feeder_task = None
    if os.getenv("DISABLE_BACKGROUND_FEEDER", "").lower() != "true" and not os.getenv("PYTHONANYWHERE_DOMAIN"):
        from app.api.v1.market import run_background_webhook_feeder
        feeder_task = asyncio.create_task(run_background_webhook_feeder())
    try:
        yield
    finally:
        if feeder_task is not None:
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


# Serve built React frontend (for single-host deployments like PythonAnywhere)
_frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.isdir(_frontend_dist):
    _assets_dir = os.path.join(_frontend_dist, "assets")
    if os.path.isdir(_assets_dir):
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        target = os.path.join(_frontend_dist, full_path)
        if full_path and os.path.isfile(target):
            return FileResponse(target)
        return FileResponse(os.path.join(_frontend_dist, "index.html"))
