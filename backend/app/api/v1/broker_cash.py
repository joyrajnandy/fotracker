from fastapi import APIRouter, Depends, Query, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.broker_cash import BrokerCash
from app.schemas.broker_cash import BrokerCashCreate, BrokerCashUpdate, BrokerCashOut
from app.services.portfolio_service import (
    add_broker_cash, update_broker_cash, delete_broker_cash, upload_broker_cash_csv,
)
from app.utils.financial_year import get_current_financial_year

router = APIRouter(prefix="/broker-cash", tags=["Broker Cash"])


@router.post("", response_model=BrokerCashOut, status_code=201)
def create_broker_cash(
    data: BrokerCashCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record cash added to the broking account."""
    return add_broker_cash(db, current_user.id, data)


@router.post("/upload")
async def upload_cash_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a CSV file with Date,Amount columns to import broker cash entries."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are accepted")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="CSV file exceeds 10 MB limit")
    return upload_broker_cash_csv(db, current_user.id, content)


@router.get("", response_model=List[BrokerCashOut])
def list_broker_cash(
    financial_year: str = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fy = financial_year or get_current_financial_year()
    return (
        db.query(BrokerCash)
        .filter(BrokerCash.user_id == current_user.id, BrokerCash.financial_year == fy)
        .order_by(BrokerCash.cash_date.desc())
        .all()
    )


@router.put("/{entry_id}", response_model=BrokerCashOut)
def edit_broker_cash(
    entry_id: int,
    data: BrokerCashUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit an existing broker cash entry and recalculate targets."""
    return update_broker_cash(db, current_user.id, entry_id, data)


@router.delete("/{entry_id}", status_code=204)
def remove_broker_cash(
    entry_id: int,
    financial_year: str = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fy = financial_year or get_current_financial_year()
    delete_broker_cash(db, current_user.id, entry_id, fy)
