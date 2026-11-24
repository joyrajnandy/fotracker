from pydantic import BaseModel
from typing import List


class TargetOut(BaseModel):
    id: int
    user_id: int
    financial_year: str
    yearly_target: float
    quarterly_target: float
    monthly_target: float
    weekly_target: float

    model_config = {"from_attributes": True}


class PeriodRow(BaseModel):
    label: str
    start: str
    end: str
    capital_base: float
    target: float
    pnl: float
    achieved: bool
    pct: float
    is_future: bool


class TargetAchievement(BaseModel):
    financial_year: str
    yearly_target: float
    quarterly_target: float
    monthly_target: float
    weekly_target: float

    yearly_pnl: float
    current_quarter_pnl: float
    current_month_pnl: float
    current_week_pnl: float
    yearly_achieved: bool
    quarterly_achieved: bool
    monthly_achieved: bool
    weekly_achieved: bool
    yearly_pct: float
    quarterly_pct: float
    monthly_pct: float
    weekly_pct: float

    all_quarters: List[PeriodRow]
    all_months: List[PeriodRow]
    all_weeks: List[PeriodRow]
