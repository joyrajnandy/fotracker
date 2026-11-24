from sqlalchemy.orm import Session
from sqlalchemy import func
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
import csv
import io
from fastapi import HTTPException
from app.models.investment import Investment
from app.models.interest import Interest
from app.models.trade import Trade
from app.models.broker_cash import BrokerCash
from app.schemas.investment import InvestmentCreate, InvestmentUpdate, InterestCreate, InterestUpdate
from app.schemas.broker_cash import BrokerCashCreate, BrokerCashUpdate
from app.services.pnl_service import calculate_pnl
from app.utils.financial_year import get_financial_year


# ─────────────────────────── XIRR helper ──────────────────────────────────────

def _xirr(cash_flows: list[tuple[date, float]]) -> Optional[float]:
    """Compute XIRR: outflows negative, terminal inflow positive."""
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


# ─────────────────────────── Holdings (GSec & MF) CRUD ────────────────────────

def add_investment(db: Session, user_id: int, data: InvestmentCreate) -> Investment:
    qty = Decimal(str(data.quantity or 1))
    buy = Decimal(str(data.buy_price))
    invested = round(qty * buy, 2)
    ltp = Decimal(str(data.ltp)) if data.ltp is not None else None
    current_val = round(qty * ltp, 2) if ltp is not None else data.current_value

    inv = Investment(
        user_id=user_id,
        instrument_type=data.instrument_type,
        instrument_code=data.instrument_code.strip() if data.instrument_code else None,
        name=data.name.strip(),
        quantity=qty,
        buy_price=buy,
        ltp=ltp,
        invested_value=invested,
        current_value=current_val,
        investment_date=data.investment_date,
        financial_year=data.financial_year,
        notes=data.notes,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv


def update_investment(db: Session, user_id: int, inv_id: int, data: InvestmentUpdate) -> Investment:
    inv = db.query(Investment).filter(Investment.id == inv_id, Investment.user_id == user_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Holding not found")
    qty = Decimal(str(data.quantity))
    buy = Decimal(str(data.buy_price))
    ltp = Decimal(str(data.ltp)) if data.ltp is not None else None

    inv.instrument_type = data.instrument_type
    inv.instrument_code = data.instrument_code.strip() if data.instrument_code else None
    inv.name = data.name.strip()
    inv.quantity = qty
    inv.buy_price = buy
    inv.ltp = ltp
    inv.invested_value = round(qty * buy, 2)
    inv.current_value = round(qty * ltp, 2) if ltp is not None else None
    db.commit()
    db.refresh(inv)
    return inv


def update_investment_current_value(db: Session, user_id: int, inv_id: int, current_value: Optional[float]) -> Investment:
    inv = db.query(Investment).filter(Investment.id == inv_id, Investment.user_id == user_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Holding not found")
    inv.current_value = current_value
    if current_value is not None and inv.quantity and float(inv.quantity) > 0:
        inv.ltp = round(Decimal(str(current_value)) / Decimal(str(inv.quantity)), 4)
    db.commit()
    db.refresh(inv)
    return inv


# ─────────────────────────── Interest CRUD ────────────────────────────────────

def add_interest(db: Session, user_id: int, data: InterestCreate) -> Interest:
    interest = Interest(user_id=user_id, **data.model_dump())
    db.add(interest)
    db.commit()
    db.refresh(interest)
    return interest


def update_interest(db: Session, user_id: int, interest_id: int, data: InterestUpdate) -> Interest:
    entry = db.query(Interest).filter(Interest.id == interest_id, Interest.user_id == user_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Interest entry not found")
    entry.amount = data.amount
    entry.interest_date = data.interest_date
    entry.description = data.description
    db.commit()
    db.refresh(entry)
    return entry


def delete_interest(db: Session, user_id: int, interest_id: int):
    entry = db.query(Interest).filter(Interest.id == interest_id, Interest.user_id == user_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Interest entry not found")
    db.delete(entry)
    db.commit()


# ─────────────────────────── Broker Cash CRUD & CSV ───────────────────────────

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


def upload_broker_cash_csv(db: Session, user_id: int, content: bytes) -> dict:
    """Parse CSV with Date,Amount[,Description] and insert broker cash entries."""
    try:
        text_data = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded")

    reader = csv.DictReader(io.StringIO(text_data))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV file is empty")

    # Normalize header names (case-insensitive)
    norm_fields = {f.strip().lower(): f for f in reader.fieldnames if f}
    if "date" not in norm_fields or "amount" not in norm_fields:
        raise HTTPException(status_code=400, detail="CSV must contain 'Date' and 'Amount' columns")

    inserted = 0
    skipped = 0
    errors = []
    affected_fys: set[str] = set()

    for idx, row in enumerate(reader, start=2):
        raw_date = (row.get(norm_fields["date"]) or "").strip()
        raw_amt = (row.get(norm_fields["amount"]) or "").strip().replace(",", "")
        desc = (row.get(norm_fields.get("description", ""), "") or "").strip() or "CSV Import"
        if not raw_date and not raw_amt:
            continue
        try:
            parsed_date = None
            for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
                try:
                    parsed_date = datetime.strptime(raw_date, fmt).date()
                    break
                except ValueError:
                    continue
            if not parsed_date:
                raise ValueError(f"Invalid date '{raw_date}'")

            amt = Decimal(raw_amt)
            if amt <= 0:
                raise ValueError("Amount must be positive")

            fy = get_financial_year(parsed_date)
            exists = db.query(BrokerCash).filter(
                BrokerCash.user_id == user_id,
                BrokerCash.cash_date == parsed_date,
                BrokerCash.amount == amt,
                BrokerCash.financial_year == fy,
            ).first()
            if exists:
                skipped += 1
                continue

            db.add(BrokerCash(
                user_id=user_id,
                amount=amt,
                cash_date=parsed_date,
                financial_year=fy,
                description=desc[:500],
            ))
            inserted += 1
            affected_fys.add(fy)
        except Exception as exc:
            errors.append(f"Row {idx}: {exc}")

    db.commit()

    from app.services.target_service import recalculate_targets_from_broker_cash
    for fy in affected_fys:
        recalculate_targets_from_broker_cash(db, user_id, fy)

    return {"inserted": inserted, "skipped": skipped, "errors": errors[:10]}


# ─────────────────────────── Carry Forward ────────────────────────────────────

def carry_forward(db: Session, user_id: int, from_fy: str, to_fy: str) -> dict:
    investments_copied = 0
    cash_copied = 0

    from_investments = (
        db.query(Investment)
        .filter(
            Investment.user_id == user_id,
            Investment.financial_year == from_fy,
            Investment.instrument_type.in_(["GSec", "Mutual Fund"]),
        )
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
            db.add(Investment(
                user_id=user_id,
                instrument_type=inv.instrument_type,
                instrument_code=inv.instrument_code,
                name=inv.name,
                quantity=inv.quantity,
                buy_price=inv.buy_price,
                ltp=inv.ltp,
                invested_value=inv.invested_value,
                current_value=inv.current_value,
                investment_date=inv.investment_date,
                financial_year=to_fy,
                notes=inv.notes,
            ))
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
            db.add(BrokerCash(
                user_id=user_id,
                amount=c.amount,
                cash_date=c.cash_date,
                financial_year=to_fy,
                description=c.description,
            ))
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
    # Holdings are strictly GSec & Mutual Fund
    investments = (
        db.query(Investment)
        .filter(
            Investment.user_id == user_id,
            Investment.financial_year == financial_year,
            Investment.instrument_type.in_(["GSec", "Mutual Fund"]),
        )
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
    total_pnl = pnl_data["net_pnl"]  # already net of brokerage
    total_brokerage = pnl_data["total_brokerage"]

    total_profit = round(total_holding_pnl + total_pnl + total_interest, 2)
    net_value = round(total_broker_cash + total_profit, 2)
    broker_vs_invested_diff = round(total_broker_cash - total_invested, 2)

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
        "total_brokerage": round(total_brokerage, 2),
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
