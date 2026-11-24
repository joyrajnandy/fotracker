from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.pnl import PnLSummary
from app.services.pnl_service import calculate_pnl, set_brokerage_setting
from app.utils.financial_year import get_current_financial_year

router = APIRouter(prefix="/pnl", tags=["P&L"])


@router.get("/summary", response_model=PnLSummary)
def pnl_summary(
    financial_year: str = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fy = financial_year or get_current_financial_year()
    return calculate_pnl(db, current_user.id, fy)


@router.put("/brokerage", response_model=PnLSummary)
def update_brokerage(
    financial_year: str = Query(default=None),
    custom_total_brokerage: Optional[float] = Body(default=None, ge=0),
    per_trade_fee: float = Body(default=69.0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set custom total brokerage (or null to reset to trades * 69) and return updated PnL."""
    fy = financial_year or get_current_financial_year()
    set_brokerage_setting(db, current_user.id, fy, custom_total_brokerage, per_trade_fee)
    return calculate_pnl(db, current_user.id, fy)
