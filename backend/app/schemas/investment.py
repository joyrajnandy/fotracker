from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import date, datetime
from decimal import Decimal


AllowedHoldingType = Literal["GSec", "Mutual Fund"]


class InvestmentCreate(BaseModel):
    instrument_type: AllowedHoldingType
    instrument_code: Optional[str] = Field(default=None, max_length=60)
    name: str = Field(..., min_length=1, max_length=200)
    quantity: Decimal = Field(default=Decimal("1"), gt=0, le=1_000_000_000)
    buy_price: Decimal = Field(..., gt=0, le=1_000_000_000)
    ltp: Optional[Decimal] = Field(default=None, ge=0, le=1_000_000_000)
    invested_value: Optional[Decimal] = Field(default=None, gt=0, le=1_000_000_000)
    current_value: Optional[Decimal] = Field(default=None, ge=0, le=1_000_000_000)
    investment_date: Optional[date] = None
    financial_year: str = Field(..., min_length=4, max_length=10)
    notes: Optional[str] = Field(default=None, max_length=500)


class InvestmentUpdate(BaseModel):
    instrument_type: AllowedHoldingType
    instrument_code: Optional[str] = Field(default=None, max_length=60)
    name: str = Field(..., min_length=1, max_length=200)
    quantity: Decimal = Field(..., gt=0, le=1_000_000_000)
    buy_price: Decimal = Field(..., gt=0, le=1_000_000_000)
    ltp: Optional[Decimal] = Field(default=None, ge=0, le=1_000_000_000)


class InvestmentOut(BaseModel):
    id: int
    user_id: int
    instrument_type: str
    instrument_code: Optional[str] = None
    name: str
    quantity: Optional[Decimal] = None
    buy_price: Optional[Decimal] = None
    ltp: Optional[Decimal] = None
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


class InterestUpdate(BaseModel):
    amount: Decimal = Field(..., gt=0, le=1_000_000_000)
    interest_date: date
    description: Optional[str] = Field(default=None, max_length=500)


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
    total_brokerage: float
    total_profit: float
    net_value: float
    financial_year: str
    growth_data: List[GrowthDataPoint]
    total_broker_cash: float
    broker_vs_invested_diff: float
    xirr: Optional[float]
    total_current_value: float
    total_holding_pnl: float
