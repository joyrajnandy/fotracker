from sqlalchemy.orm import Session
from app.models.trade import Trade
from app.models.brokerage import BrokerageSetting
from datetime import date
from typing import Optional


def _get_symbol_base(symbol: str) -> str:
    """Strip expiry+strike+CE/PE suffix to get the base index name."""
    for i, ch in enumerate(symbol):
        if ch.isdigit():
            return symbol[:i]
    return symbol


def get_or_create_brokerage_setting(db: Session, user_id: int, financial_year: str) -> BrokerageSetting:
    setting = (
        db.query(BrokerageSetting)
        .filter(BrokerageSetting.user_id == user_id, BrokerageSetting.financial_year == financial_year)
        .first()
    )
    if not setting:
        setting = BrokerageSetting(
            user_id=user_id,
            financial_year=financial_year,
            per_trade_fee=69.00,
            custom_total_brokerage=None,
        )
        db.add(setting)
        db.commit()
        db.refresh(setting)
    return setting


def set_brokerage_setting(
    db: Session,
    user_id: int,
    financial_year: str,
    custom_total_brokerage: Optional[float],
    per_trade_fee: float = 69.0,
) -> BrokerageSetting:
    setting = get_or_create_brokerage_setting(db, user_id, financial_year)
    setting.per_trade_fee = per_trade_fee
    setting.custom_total_brokerage = custom_total_brokerage
    db.commit()
    db.refresh(setting)
    return setting


def calculate_pnl(db: Session, user_id: int, financial_year: str) -> dict:
    trades = (
        db.query(Trade)
        .filter(Trade.user_id == user_id, Trade.financial_year == financial_year)
        .all()
    )
    setting = get_or_create_brokerage_setting(db, user_id, financial_year)
    per_trade_fee = float(setting.per_trade_fee or 69.0)
    total_trades = len(trades)
    calculated_brokerage = round(total_trades * per_trade_fee, 2)
    is_custom = setting.custom_total_brokerage is not None
    total_brokerage = round(float(setting.custom_total_brokerage), 2) if is_custom else calculated_brokerage

    # Group by (expiry_date, symbol_base)
    groups: dict = {}
    for t in trades:
        key = (t.expiry_date, _get_symbol_base(t.symbol))
        groups.setdefault(key, {"buys": [], "sells": []})
        groups[key]["buys" if t.trade_type == "buy" else "sells"].append(t)

    pnl_records, total_profit, total_loss = [], 0.0, 0.0
    gross_net_pnl = 0.0
    profitable_expiries = losing_expiries = 0

    for (expiry_date, symbol_base), data in groups.items():
        buy_qty = sum(float(t.quantity) for t in data["buys"])
        sell_qty = sum(float(t.quantity) for t in data["sells"])
        buy_value = sum(float(t.quantity) * float(t.price) for t in data["buys"])
        sell_value = sum(float(t.quantity) * float(t.price) for t in data["sells"])
        trades_count = len(data["buys"]) + len(data["sells"])

        gross_pnl = round(sell_value - buy_value, 2)
        gross_net_pnl += gross_pnl

        if total_trades > 0:
            expiry_brokerage = round(total_brokerage * (trades_count / total_trades), 2)
        else:
            expiry_brokerage = 0.0

        net_realized_pnl = round(gross_pnl - expiry_brokerage, 2)

        if net_realized_pnl > 0:
            total_profit += net_realized_pnl
            profitable_expiries += 1
        elif net_realized_pnl < 0:
            total_loss += abs(net_realized_pnl)
            losing_expiries += 1

        pnl_records.append({
            "expiry_date": expiry_date,
            "symbol_base": symbol_base,
            "total_buy_qty": buy_qty,
            "total_sell_qty": sell_qty,
            "buy_value": round(buy_value, 2),
            "sell_value": round(sell_value, 2),
            "gross_pnl": gross_pnl,
            "brokerage": expiry_brokerage,
            "realized_pnl": net_realized_pnl,
            "trades_count": trades_count,
            "status": "profit" if net_realized_pnl > 0 else ("loss" if net_realized_pnl < 0 else "breakeven"),
        })

    pnl_records.sort(key=lambda x: x["expiry_date"] or date.min, reverse=True)

    return {
        "total_profit": round(total_profit, 2),
        "total_loss": round(total_loss, 2),
        "gross_net_pnl": round(gross_net_pnl, 2),
        "net_pnl": round(total_profit - total_loss, 2),
        "total_brokerage": total_brokerage,
        "calculated_brokerage": calculated_brokerage,
        "per_trade_fee": per_trade_fee,
        "is_custom_brokerage": is_custom,
        "total_trades": total_trades,
        "profitable_expiries": profitable_expiries,
        "losing_expiries": losing_expiries,
        "financial_year": financial_year,
        "by_expiry": pnl_records,
    }


def calculate_period_pnl(trades: list, start_date: date, end_date: date, per_trade_fee: float = 69.0) -> float:
    """Net period P&L after deducting brokerage per trade."""
    period = [t for t in trades if start_date <= t.trade_date <= end_date]
    buy = sum(float(t.quantity) * float(t.price) for t in period if t.trade_type == "buy")
    sell = sum(float(t.quantity) * float(t.price) for t in period if t.trade_type == "sell")
    brokerage = len(period) * per_trade_fee
    return round((sell - buy) - brokerage, 2)
