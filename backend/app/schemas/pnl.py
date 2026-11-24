from pydantic import BaseModel
from typing import List, Optional
from datetime import date


class PnLByExpiry(BaseModel):
    expiry_date: Optional[date]
    symbol_base: str
    total_buy_qty: float
    total_sell_qty: float
    buy_value: float
    sell_value: float
    gross_pnl: float
    brokerage: float
    realized_pnl: float   # net after brokerage
    trades_count: int
    status: str   # profit / loss / breakeven


class PnLSummary(BaseModel):
    total_profit: float
    total_loss: float
    gross_net_pnl: float
    net_pnl: float              # after brokerage
    total_brokerage: float
    calculated_brokerage: float
    per_trade_fee: float
    is_custom_brokerage: bool
    total_trades: int
    profitable_expiries: int
    losing_expiries: int
    financial_year: str
    by_expiry: List[PnLByExpiry]
