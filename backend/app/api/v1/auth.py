from fastapi import APIRouter, Depends, HTTPException, Query, Request, Body, status
from sqlalchemy.orm import Session
from typing import List
from collections import defaultdict
from datetime import datetime, timedelta, timezone
import time
import uuid
from jose import jwt
from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_token
from app.core.dependencies import get_current_user
from app.schemas.auth import UserCreate, UserLogin, Token, TokenRefresh, UserOut
from app.services.auth_service import create_user, authenticate_user, generate_tokens
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["Authentication"])

_auth_attempts: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW_SEC = 60
_MAX_ATTEMPTS = 15
_used_invite_jtis: set[str] = set()


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


def _validate_invite(token: str) -> dict:
    payload = decode_token(token)
    if not payload or payload.get("type") != "invite":
        raise HTTPException(status_code=403, detail="Invalid or expired registration invite link.")
    jti = payload.get("jti")
    if jti and jti in _used_invite_jtis:
        raise HTTPException(status_code=403, detail="This registration invite link has already been used.")
    return payload


@router.post("/invite-link")
def create_invite_link(current_user: User = Depends(get_current_user)):
    """Admin-only: generate a 10-minute registration invite link."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Only admin users can generate registration links.")
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    jti = str(uuid.uuid4())
    token = jwt.encode(
        {
            "type": "invite",
            "jti": jti,
            "invited_by": current_user.id,
            "exp": expires_at,
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    return {
        "invite_token": token,
        "expires_at": expires_at.isoformat(),
        "expires_in_seconds": 600,
    }


@router.get("/invite-validate")
def validate_invite_link(token: str = Query(...)):
    """Validate whether a 10-minute invite token is still active."""
    payload = _validate_invite(token)
    exp = payload.get("exp")
    return {"valid": True, "exp": exp}


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, request: Request, db: Session = Depends(get_db)):
    """Register a new user account using a valid 10-minute admin invite token."""
    _check_rate_limit(request)
    payload = _validate_invite(user_data.invite_token)
    user = create_user(db, user_data)
    if payload.get("jti"):
        _used_invite_jtis.add(payload["jti"])
    return user


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


@router.get("/users", response_model=List[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin-only: list all users and their status."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return db.query(User).order_by(User.id.asc()).all()


@router.patch("/users/{user_id}/status", response_model=UserOut)
def toggle_user_status(
    user_id: int,
    is_active: bool = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin-only: activate or deactivate a user."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    if user_id == current_user.id and not is_active:
        raise HTTPException(status_code=400, detail="Admin cannot deactivate their own account")
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    target_user.is_active = is_active
    db.commit()
    db.refresh(target_user)
    return target_user
