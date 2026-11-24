from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime
from decimal import Decimal


class BrokerCashCreate(BaseModel):
    amount: Decimal = Field(..., gt=0, le=1_000_000_000)
    cash_date: date
    financial_year: str = Field(..., min_length=4, max_length=10)
    description: Optional[str] = Field(default=None, max_length=500)


class BrokerCashUpdate(BaseModel):
    amount: Decimal = Field(..., gt=0, le=1_000_000_000)
    cash_date: date
    description: Optional[str] = Field(default=None, max_length=500)


class BrokerCashOut(BrokerCashCreate):
    id: int
    user_id: int
    created_at: datetime

    model_config = {"from_attributes": True}
