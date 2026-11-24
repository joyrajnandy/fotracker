from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from collections import defaultdict
import time
from app.core.database import get_db
from app.core.security import decode_token
from app.core.dependencies import get_current_user
from app.schemas.auth import UserCreate, UserLogin, Token, TokenRefresh, UserOut
from app.services.auth_service import create_user, authenticate_user, generate_tokens
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Simple in-memory sliding-window rate limiter for auth endpoints (pen-test brute-force protection)
_auth_attempts: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW_SEC = 60
_MAX_ATTEMPTS = 15


def _check_rate_limit(request: Request):
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    recent = [t for t in _auth_attempts[client_ip] if now - t < _RATE_WINDOW_SEC]
    _auth_attempts[client_ip] = recent
    if len(recent) >= _MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many authentication attempts. Please try again in a minute.",
        )
    _auth_attempts[client_ip].append(now)


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, request: Request, db: Session = Depends(get_db)):
    """Register a new user account."""
    _check_rate_limit(request)
    return create_user(db, user_data)


@router.post("/login", response_model=Token)
def login(credentials: UserLogin, request: Request, db: Session = Depends(get_db)):
    """Authenticate and receive access + refresh tokens."""
    _check_rate_limit(request)
    user = authenticate_user(db, credentials.username, credentials.password)
    return generate_tokens(user)


@router.post("/refresh", response_model=Token)
def refresh(token_data: TokenRefresh, request: Request, db: Session = Depends(get_db)):
    """Get a new access token using a refresh token."""
    _check_rate_limit(request)
    payload = decode_token(token_data.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    try:
        user_id = int(payload["sub"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return generate_tokens(user)


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    """Return the current logged-in user's profile."""
    return current_user
