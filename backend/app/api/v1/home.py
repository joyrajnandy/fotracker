from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy.orm import Session
from typing import List, Optional
from decimal import Decimal
import httpx
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.investment import Investment
from app.models.interest import Interest
from app.schemas.investment import (
    InvestmentCreate, InvestmentUpdate, InvestmentOut,
    InterestCreate, InterestUpdate, InterestOut, HomeSummary,
)
from app.services.portfolio_service import (
    add_investment, update_investment, add_interest, update_interest, delete_interest,
    get_home_summary, update_investment_current_value, carry_forward,
)
from app.api.v1.market import resolve_live_ltp
from app.utils.financial_year import get_current_financial_year, get_available_financial_years

router = APIRouter(prefix="/home", tags=["Home"])


@router.get("/financial-years")
def financial_years():
    current_fy = get_current_financial_year()
    return {"years": get_available_financial_years(), "current_fy": current_fy}


@router.get("/summary", response_model=HomeSummary)
def summary(
    financial_year: str = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fy = financial_year or get_current_financial_year()
    return get_home_summary(db, current_user.id, fy)


@router.post("/investment", response_model=InvestmentOut, status_code=201)
def create_investment(
    data: InvestmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return add_investment(db, current_user.id, data)


@router.put("/investment/{inv_id}", response_model=InvestmentOut)
def edit_investment(
    inv_id: int,
    data: InvestmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Modify an existing GSec or Mutual Fund holding."""
    return update_investment(db, current_user.id, inv_id, data)


@router.patch("/investment/{inv_id}/current-value", response_model=InvestmentOut)
def patch_investment_current_value(
    inv_id: int,
    current_value: Optional[float] = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return update_investment_current_value(db, current_user.id, inv_id, current_value)


@router.post("/investments/refresh-ltp")
async def refresh_all_ltp(
    financial_year: str = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Refresh live LTP & Current Value for all GSec/MF holdings."""
    fy = financial_year or get_current_financial_year()
    holdings = (
        db.query(Investment)
        .filter(
            Investment.user_id == current_user.id,
            Investment.financial_year == fy,
            Investment.instrument_type.in_(["GSec", "Mutual Fund"]),
        )
        .all()
    )
    updated = 0
    failed = []
    async with httpx.AsyncClient() as client:
        for h in holdings:
            res = await resolve_live_ltp(client, h.instrument_code, h.instrument_type, h.name)
            if res and res.get("ltp") is not None:
                qty = Decimal(str(h.quantity or 1))
                ltp_dec = Decimal(str(round(float(res["ltp"]), 4)))
                h.ltp = ltp_dec
                h.current_value = round(qty * ltp_dec, 2)
                if not h.instrument_code and res.get("matched_code"):
                    h.instrument_code = res["matched_code"][:60]
                updated += 1
            else:
                failed.append(h.name)
    db.commit()
    return {"updated": updated, "total": len(holdings), "failed": failed}


@router.get("/investments", response_model=List[InvestmentOut])
def list_investments(
    financial_year: str = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fy = financial_year or get_current_financial_year()
    return (
        db.query(Investment)
        .filter(
            Investment.user_id == current_user.id,
            Investment.financial_year == fy,
            Investment.instrument_type.in_(["GSec", "Mutual Fund"]),
        )
        .order_by(Investment.id.desc())
        .all()
    )


@router.delete("/investment/{inv_id}", status_code=204)
def delete_investment(
    inv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inv = db.query(Investment).filter(
        Investment.id == inv_id, Investment.user_id == current_user.id
    ).first()
    if not inv:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Holding not found")
    db.delete(inv)
    db.commit()


@router.post("/interest", response_model=InterestOut, status_code=201)
def create_interest(
    data: InterestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return add_interest(db, current_user.id, data)


@router.put("/interest/{interest_id}", response_model=InterestOut)
def edit_interest(
    interest_id: int,
    data: InterestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit an existing interest entry."""
    return update_interest(db, current_user.id, interest_id, data)


@router.delete("/interest/{interest_id}", status_code=204)
def remove_interest(
    interest_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    delete_interest(db, current_user.id, interest_id)


@router.get("/interests", response_model=List[InterestOut])
def list_interests(
    financial_year: str = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fy = financial_year or get_current_financial_year()
    return (
        db.query(Interest)
        .filter(Interest.user_id == current_user.id, Interest.financial_year == fy)
        .order_by(Interest.interest_date.desc())
        .all()
    )


@router.post("/carry-forward")
def carry_forward_to_next_fy(
    from_fy: str = Query(..., description="Source FY e.g. 2025-26"),
    to_fy: str = Query(..., description="Target FY e.g. 2026-27"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return carry_forward(db, current_user.id, from_fy, to_fy)
