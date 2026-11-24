from fastapi import APIRouter, Depends, UploadFile, File, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.trade import TradeUploadResponse, TradeListResponse
from app.services.trade_service import upload_trades_csv, get_trades
from app.utils.financial_year import get_current_financial_year

router = APIRouter(prefix="/tradebook", tags=["Tradebook"])


@router.post("/upload", response_model=TradeUploadResponse)
async def upload_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a CSV file of trades. Duplicates are skipped automatically."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are accepted")
    max_size = 10 * 1024 * 1024  # 10 MB limit
    content = await file.read()
    if len(content) > max_size:
        raise HTTPException(status_code=413, detail="CSV file exceeds 10 MB limit")
    return upload_trades_csv(db, current_user.id, content)


@router.get("/trades", response_model=TradeListResponse)
def list_trades(
    financial_year: str = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=15, ge=1, le=100),
    symbol: Optional[str] = Query(default=None),
    trade_type: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fy = financial_year or get_current_financial_year()
    return get_trades(db, current_user.id, fy, page, page_size, symbol, trade_type)
