from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Literal
from datetime import date, datetime
from decimal import Decimal


AllowedHoldingType = Literal["GSec", "Mutual Fund"]


class InvestmentCreate(BaseModel):
    instrument_type: AllowedHoldingType
    name: str = Field(..., min_length=1, max_length=200)
    invested_value: Decimal = Field(..., gt=0, le=1_000_000_000)
    current_value: Optional[Decimal] = Field(default=None, ge=0, le=1_000_000_000)
    investment_date: Optional[date] = None
    financial_year: str = Field(..., min_length=4, max_length=10)
    notes: Optional[str] = Field(default=None, max_length=500)


class InvestmentUpdate(BaseModel):
    instrument_type: AllowedHoldingType
    name: str = Field(..., min_length=1, max_length=200)
    invested_value: Decimal = Field(..., gt=0, le=1_000_000_000)
    current_value: Optional[Decimal] = Field(default=None, ge=0, le=1_000_000_000)


class InvestmentOut(BaseModel):
    id: int
    user_id: int
    instrument_type: str
    name: str
    invested_value: Decimal
    current_value: Optional[Decimal] = None
    investment_date: Optional[date] = None
    financial_year: str
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class InterestCreate(BaseModel):
    investment_id: Optional[int] = None
    amount: Decimal = Field(..., gt=0, le=1_000_000_000)
    interest_date: date
    description: Optional[str] = Field(default=None, max_length=500)
    financial_year: str = Field(..., min_length=4, max_length=10)


class InterestOut(InterestCreate):
    id: int
    user_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class GrowthDataPoint(BaseModel):
    date: str
    invested: float
    returns: float
    net_value: float


class HomeSummary(BaseModel):
    total_invested: float
    total_interest: float
    total_pnl: float
    total_profit: float              # holding_pnl + total_pnl + total_interest
    net_value: float                 # total_broker_cash + total_profit
    financial_year: str
    growth_data: List[GrowthDataPoint]
    total_broker_cash: float
    broker_vs_invested_diff: float   # total_broker_cash - total_invested
    xirr: Optional[float]            # annualised XIRR based on broker cash flows + net_value
    total_current_value: float
    total_holding_pnl: float
