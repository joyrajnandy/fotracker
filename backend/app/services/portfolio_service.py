from sqlalchemy.orm import Session
from sqlalchemy import func
from collections import defaultdict
from datetime import date
from typing import Optional
from fastapi import HTTPException
from app.models.investment import Investment
from app.models.interest import Interest
from app.models.trade import Trade
from app.models.broker_cash import BrokerCash
from app.schemas.investment import InvestmentCreate, InvestmentUpdate, InterestCreate
from app.schemas.broker_cash import BrokerCashCreate, BrokerCashUpdate
from app.services.pnl_service import calculate_pnl


# ─────────────────────────── XIRR helper ──────────────────────────────────────

def _xirr(cash_flows: list[tuple[date, float]]) -> Optional[float]:
    """
    Compute XIRR: outflows (cash out of pocket) = negative, terminal inflow = positive.
    Returns annualised rate as decimal (0.12 = 12 %) or None.
    """
    if len(cash_flows) < 2:
        return None
    try:
        from pyxirr import xirr as _pyxirr
        dates = [cf[0] for cf in cash_flows]
        amounts = [cf[1] for cf in cash_flows]
        result = _pyxirr(dates, amounts)
        return round(float(result), 6) if result is not None else None
    except Exception:
        return None


# ─────────────────────────── Investment (Holdings) CRUD ───────────────────────

def add_investment(db: Session, user_id: int, data: InvestmentCreate) -> Investment:
    inv = Investment(user_id=user_id, **data.model_dump())
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv


def update_investment(db: Session, user_id: int, inv_id: int, data: InvestmentUpdate) -> Investment:
    inv = db.query(Investment).filter(Investment.id == inv_id, Investment.user_id == user_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Holding not found")
    inv.instrument_type = data.instrument_type
    inv.name = data.name
    inv.invested_value = data.invested_value
    inv.current_value = data.current_value
    db.commit()
    db.refresh(inv)
    return inv


def update_investment_current_value(db: Session, user_id: int, inv_id: int, current_value: Optional[float]) -> Investment:
    inv = db.query(Investment).filter(Investment.id == inv_id, Investment.user_id == user_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Holding not found")
    inv.current_value = current_value
    db.commit()
    db.refresh(inv)
    return inv


def add_interest(db: Session, user_id: int, data: InterestCreate) -> Interest:
    interest = Interest(user_id=user_id, **data.model_dump())
    db.add(interest)
    db.commit()
    db.refresh(interest)
    return interest


# ─────────────────────────── Broker Cash CRUD ─────────────────────────────────

def add_broker_cash(db: Session, user_id: int, data: BrokerCashCreate) -> BrokerCash:
    entry = BrokerCash(user_id=user_id, **data.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    from app.services.target_service import recalculate_targets_from_broker_cash
    recalculate_targets_from_broker_cash(db, user_id, data.financial_year)
    return entry


def update_broker_cash(db: Session, user_id: int, entry_id: int, data: BrokerCashUpdate) -> BrokerCash:
    entry = db.query(BrokerCash).filter(
        BrokerCash.id == entry_id, BrokerCash.user_id == user_id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Broker cash entry not found")
    entry.amount = data.amount
    entry.cash_date = data.cash_date
    entry.description = data.description
    db.commit()
    db.refresh(entry)
    from app.services.target_service import recalculate_targets_from_broker_cash
    recalculate_targets_from_broker_cash(db, user_id, entry.financial_year)
    return entry


def delete_broker_cash(db: Session, user_id: int, entry_id: int, financial_year: str):
    entry = db.query(BrokerCash).filter(
        BrokerCash.id == entry_id, BrokerCash.user_id == user_id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Broker cash entry not found")
    fy = entry.financial_year or financial_year
    db.delete(entry)
    db.commit()
    from app.services.target_service import recalculate_targets_from_broker_cash
    recalculate_targets_from_broker_cash(db, user_id, fy)


# ─────────────────────────── Carry Forward ────────────────────────────────────

def carry_forward(db: Session, user_id: int, from_fy: str, to_fy: str) -> dict:
    """
    Copy all holdings (investments) and broker_cash from from_fy into to_fy.
    Already-existing records in to_fy are skipped.
    """
    investments_copied = 0
    cash_copied = 0

    from_investments = (
        db.query(Investment)
        .filter(Investment.user_id == user_id, Investment.financial_year == from_fy)
        .all()
    )
    for inv in from_investments:
        exists = db.query(Investment).filter(
            Investment.user_id == user_id,
            Investment.financial_year == to_fy,
            Investment.instrument_type == inv.instrument_type,
            Investment.name == inv.name,
            Investment.invested_value == inv.invested_value,
        ).first()
        if not exists:
            new_inv = Investment(
                user_id=user_id,
                instrument_type=inv.instrument_type,
                name=inv.name,
                invested_value=inv.invested_value,
                investment_date=inv.investment_date,
                financial_year=to_fy,
                notes=inv.notes,
                current_value=inv.current_value,
            )
            db.add(new_inv)
            investments_copied += 1

    from_cash = (
        db.query(BrokerCash)
        .filter(BrokerCash.user_id == user_id, BrokerCash.financial_year == from_fy)
        .all()
    )
    for c in from_cash:
        exists = db.query(BrokerCash).filter(
            BrokerCash.user_id == user_id,
            BrokerCash.financial_year == to_fy,
            BrokerCash.amount == c.amount,
            BrokerCash.cash_date == c.cash_date,
        ).first()
        if not exists:
            new_cash = BrokerCash(
                user_id=user_id,
                amount=c.amount,
                cash_date=c.cash_date,
                financial_year=to_fy,
                description=c.description,
            )
            db.add(new_cash)
            cash_copied += 1

    db.commit()

    from app.services.target_service import recalculate_targets_from_broker_cash
    recalculate_targets_from_broker_cash(db, user_id, to_fy)

    return {
        "investments_copied": investments_copied,
        "cash_copied": cash_copied,
        "from_fy": from_fy,
        "to_fy": to_fy,
    }


# ─────────────────────────── Home Summary ─────────────────────────────────────

def get_home_summary(db: Session, user_id: int, financial_year: str) -> dict:
    investments = (
        db.query(Investment)
        .filter(Investment.user_id == user_id, Investment.financial_year == financial_year)
        .all()
    )

    total_invested = sum(float(i.invested_value) for i in investments)
    total_current_value = sum(
        float(i.current_value) if i.current_value is not None else float(i.invested_value)
        for i in investments
    )
    total_holding_pnl = sum(
        float(i.current_value) - float(i.invested_value)
        for i in investments
        if i.current_value is not None
    )

    total_interest = float(
        db.query(func.coalesce(func.sum(Interest.amount), 0))
        .filter(Interest.user_id == user_id, Interest.financial_year == financial_year)
        .scalar()
        or 0
    )
    total_broker_cash = float(
        db.query(func.coalesce(func.sum(BrokerCash.amount), 0))
        .filter(BrokerCash.user_id == user_id, BrokerCash.financial_year == financial_year)
        .scalar()
        or 0
    )

    pnl_data = calculate_pnl(db, user_id, financial_year)
    total_pnl = pnl_data["net_pnl"]

    # Total profit = Holding P&L (GSec/MF) + F&O P&L + Interest accumulated
    total_profit = round(total_holding_pnl + total_pnl + total_interest, 2)
    # Net Portfolio Value = Real Capital (Broker Cash) + Total Profit
    net_value = round(total_broker_cash + total_profit, 2)
    broker_vs_invested_diff = round(total_broker_cash - total_invested, 2)

    # XIRR: broker cash outflows → today's net value as terminal inflow
    broker_cash_rows = (
        db.query(BrokerCash)
        .filter(BrokerCash.user_id == user_id, BrokerCash.financial_year == financial_year)
        .order_by(BrokerCash.cash_date)
        .all()
    )
    xirr_value: Optional[float] = None
    if broker_cash_rows and net_value > 0:
        cash_flows: list[tuple[date, float]] = [
            (row.cash_date, -float(row.amount)) for row in broker_cash_rows
        ]
        cash_flows.append((date.today(), net_value))
        xirr_value = _xirr(cash_flows)

    growth_data = _build_growth_chart(db, user_id, financial_year, total_broker_cash)

    return {
        "total_invested": round(total_invested, 2),
        "total_interest": round(total_interest, 2),
        "total_pnl": round(total_pnl, 2),
        "total_profit": total_profit,
        "net_value": net_value,
        "financial_year": financial_year,
        "growth_data": growth_data,
        "total_broker_cash": round(total_broker_cash, 2),
        "broker_vs_invested_diff": broker_vs_invested_diff,
        "xirr": xirr_value,
        "total_current_value": round(total_current_value, 2),
        "total_holding_pnl": round(total_holding_pnl, 2),
    }


# ─────────────────────────── Growth Chart ─────────────────────────────────────

def _build_growth_chart(db: Session, user_id: int, financial_year: str, total_capital: float) -> list:
    trades = (
        db.query(Trade)
        .filter(Trade.user_id == user_id, Trade.financial_year == financial_year)
        .order_by(Trade.trade_date)
        .all()
    )
    interests = (
        db.query(Interest)
        .filter(Interest.user_id == user_id, Interest.financial_year == financial_year)
        .order_by(Interest.interest_date)
        .all()
    )

    monthly_pnl: dict = defaultdict(float)
    monthly_int: dict = defaultdict(float)

    for t in trades:
        mk = t.trade_date.strftime("%Y-%m")
        val = float(t.quantity) * float(t.price)
        monthly_pnl[mk] += val if t.trade_type == "sell" else -val

    for i in interests:
        monthly_int[i.interest_date.strftime("%Y-%m")] += float(i.amount)

    all_months = sorted(set(list(monthly_pnl) + list(monthly_int)))
    cumulative = 0.0
    result = []
    for m in all_months:
        cumulative += monthly_pnl.get(m, 0) + monthly_int.get(m, 0)
        result.append({
            "date": m,
            "invested": total_capital,
            "returns": round(cumulative, 2),
            "net_value": round(total_capital + cumulative, 2),
        })
    return result
