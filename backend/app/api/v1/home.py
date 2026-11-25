from fastapi import APIRouter, Depends, Query, Body, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from decimal import Decimal
from datetime import date, datetime
import json
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


@router.get("/backup")
def export_backup(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export all user portfolio data (broker cash, holdings, interests, trades) as JSON."""
    from app.models.broker_cash import BrokerCash
    from app.models.trade import Trade

    def _ser(obj):
        out = {}
        for c in obj.__table__.columns:
            if c.name in ("id", "user_id", "created_at", "updated_at"):
                continue
            val = getattr(obj, c.name)
            if isinstance(val, (date, datetime)):
                val = val.isoformat()
            elif isinstance(val, Decimal):
                val = float(val)
            out[c.name] = val
        return out

    payload = {
        "exported_at": datetime.utcnow().isoformat(),
        "broker_cash": [_ser(r) for r in db.query(BrokerCash).filter(BrokerCash.user_id == current_user.id).all()],
        "investments": [_ser(r) for r in db.query(Investment).filter(Investment.user_id == current_user.id).all()],
        "interests": [_ser(r) for r in db.query(Interest).filter(Interest.user_id == current_user.id).all()],
        "trades": [_ser(r) for r in db.query(Trade).filter(Trade.user_id == current_user.id).all()],
    }
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": "attachment; filename=fotracker-backup.json"},
    )


@router.post("/restore")
async def restore_backup(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Restore portfolio data from an exported fotracker-backup.json file (skips duplicates)."""
    from app.models.broker_cash import BrokerCash
    from app.models.trade import Trade

    raw = await file.read()
    try:
        data = json.loads(raw.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON backup file")

    counts = {"broker_cash": 0, "investments": 0, "interests": 0, "trades": 0}

    for item in data.get("broker_cash", []):
        cd = date.fromisoformat(item["cash_date"])
        amt = Decimal(str(item["amount"]))
        exists = db.query(BrokerCash).filter(
            BrokerCash.user_id == current_user.id,
            BrokerCash.cash_date == cd,
            BrokerCash.amount == amt,
            BrokerCash.financial_year == item["financial_year"],
        ).first()
        if not exists:
            db.add(BrokerCash(
                user_id=current_user.id,
                amount=amt,
                cash_date=cd,
                financial_year=item["financial_year"],
                description=item.get("description"),
            ))
            counts["broker_cash"] += 1

    for item in data.get("investments", []):
        exists = db.query(Investment).filter(
            Investment.user_id == current_user.id,
            Investment.name == item["name"],
            Investment.instrument_type == item["instrument_type"],
            Investment.financial_year == item["financial_year"],
        ).first()
        if not exists:
            db.add(Investment(
                user_id=current_user.id,
                instrument_type=item["instrument_type"],
                instrument_code=item.get("instrument_code"),
                name=item["name"],
                quantity=Decimal(str(item.get("quantity") or 1)),
                buy_price=Decimal(str(item["buy_price"])) if item.get("buy_price") is not None else None,
                ltp=Decimal(str(item["ltp"])) if item.get("ltp") is not None else None,
                invested_value=Decimal(str(item["invested_value"])),
                current_value=Decimal(str(item["current_value"])) if item.get("current_value") is not None else None,
                investment_date=date.fromisoformat(item["investment_date"]) if item.get("investment_date") else None,
                financial_year=item["financial_year"],
                notes=item.get("notes"),
            ))
            counts["investments"] += 1

    for item in data.get("interests", []):
        id_dt = date.fromisoformat(item["interest_date"])
        amt = Decimal(str(item["amount"]))
        exists = db.query(Interest).filter(
            Interest.user_id == current_user.id,
            Interest.interest_date == id_dt,
            Interest.amount == amt,
            Interest.financial_year == item["financial_year"],
        ).first()
        if not exists:
            db.add(Interest(
                user_id=current_user.id,
                amount=amt,
                interest_date=id_dt,
                description=item.get("description"),
                financial_year=item["financial_year"],
            ))
            counts["interests"] += 1

    for item in data.get("trades", []):
        exists = db.query(Trade).filter(
            Trade.user_id == current_user.id,
            Trade.trade_id == item["trade_id"],
            Trade.order_id == item["order_id"],
        ).first()
        if not exists:
            db.add(Trade(
                user_id=current_user.id,
                symbol=item["symbol"],
                isin=item.get("isin"),
                trade_date=date.fromisoformat(item["trade_date"]),
                exchange=item["exchange"],
                segment=item["segment"],
                series=item.get("series"),
                trade_type=item["trade_type"],
                auction=bool(item.get("auction", False)),
                quantity=Decimal(str(item["quantity"])),
                price=Decimal(str(item["price"])),
                trade_id=item["trade_id"],
                order_id=item["order_id"],
                order_execution_time=datetime.fromisoformat(item["order_execution_time"]),
                expiry_date=date.fromisoformat(item["expiry_date"]) if item.get("expiry_date") else None,
                financial_year=item["financial_year"],
            ))
            counts["trades"] += 1

    db.commit()
    return {"restored": counts}
