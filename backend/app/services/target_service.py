from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta
from typing import List
import calendar
from app.models.target import Target
from app.models.broker_cash import BrokerCash
from app.models.trade import Trade
from app.services.pnl_service import calculate_period_pnl, get_or_create_brokerage_setting


def _fy_start_end(financial_year: str):
    yr = int(financial_year.split("-")[0])
    return date(yr, 4, 1), date(yr + 1, 3, 31)


def _all_months_in_fy(financial_year: str) -> List[tuple]:
    yr = int(financial_year.split("-")[0])
    months = []
    for offset in range(12):
        m = (3 + offset) % 12 + 1
        y = yr if m >= 4 else yr + 1
        last_day = calendar.monthrange(y, m)[1]
        label = date(y, m, 1).strftime("%b %Y")
        months.append((label, date(y, m, 1), date(y, m, last_day)))
    return months


def _all_quarters_in_fy(financial_year: str) -> List[tuple]:
    yr = int(financial_year.split("-")[0])
    return [
        ("Q1 (Apr-Jun)", date(yr, 4, 1), date(yr, 6, 30)),
        ("Q2 (Jul-Sep)", date(yr, 7, 1), date(yr, 9, 30)),
        ("Q3 (Oct-Dec)", date(yr, 10, 1), date(yr, 12, 31)),
        ("Q4 (Jan-Mar)", date(yr + 1, 1, 1), date(yr + 1, 3, 31)),
    ]


def _all_weeks_in_fy(financial_year: str) -> List[tuple]:
    yr = int(financial_year.split("-")[0])
    start = date(yr, 4, 1)
    end = date(yr + 1, 3, 31)
    cur = start - timedelta(days=start.weekday())
    weeks = []
    week_num = 1
    while cur <= end:
        w_start = max(cur, start)
        w_end = min(cur + timedelta(days=6), end)
        label = f"W{week_num} ({w_start.strftime('%d %b')} - {w_end.strftime('%d %b %Y')})"
        weeks.append((label, w_start, w_end))
        cur += timedelta(weeks=1)
        week_num += 1
    return weeks


def _recalculate(db: Session, user_id: int, financial_year: str) -> Target:
    """Targets are strictly based on total broker cash added (0 when no cash added)."""
    total_broker_cash = float(
        db.query(func.coalesce(func.sum(BrokerCash.amount), 0))
        .filter(BrokerCash.user_id == user_id, BrokerCash.financial_year == financial_year)
        .scalar()
        or 0
    )
    yearly = round(total_broker_cash * 0.10, 2) if total_broker_cash > 0 else 0.0

    target = (
        db.query(Target)
        .filter(Target.user_id == user_id, Target.financial_year == financial_year)
        .first()
    )
    if target:
        target.yearly_target = yearly
        target.quarterly_target = round(yearly / 4, 2)
        target.monthly_target = round(yearly / 12, 2)
        target.weekly_target = round(yearly / 52, 2)
    else:
        target = Target(
            user_id=user_id,
            financial_year=financial_year,
            yearly_target=yearly,
            quarterly_target=round(yearly / 4, 2),
            monthly_target=round(yearly / 12, 2),
            weekly_target=round(yearly / 52, 2),
        )
        db.add(target)
    db.commit()
    db.refresh(target)
    return target


def get_or_create_target(db: Session, user_id: int, financial_year: str) -> Target:
    return _recalculate(db, user_id, financial_year)


def recalculate_targets_from_broker_cash(db: Session, user_id: int, financial_year: str) -> Target:
    return _recalculate(db, user_id, financial_year)


def recalculate_targets_from_investment(db: Session, user_id: int, financial_year: str) -> Target:
    return _recalculate(db, user_id, financial_year)


def _capital_as_of(cash_entries: list, as_of_date: date) -> float:
    return sum(float(c.amount) for c in cash_entries if c.cash_date <= as_of_date)


def get_target_achievement(db: Session, user_id: int, financial_year: str) -> dict:
    # Always compute fresh from BrokerCash so 0 investment => 0 target (no stale defaults)
    target = _recalculate(db, user_id, financial_year)
    today = date.today()

    all_trades = db.query(Trade).filter(
        Trade.user_id == user_id,
        Trade.financial_year == financial_year,
    ).all()

    b_setting = get_or_create_brokerage_setting(db, user_id, financial_year)
    if b_setting.custom_total_brokerage is not None and len(all_trades) > 0:
        per_trade_fee = float(b_setting.custom_total_brokerage) / len(all_trades)
    else:
        per_trade_fee = float(b_setting.per_trade_fee if b_setting.per_trade_fee is not None else 25.7)

    cash_entries = (
        db.query(BrokerCash)
        .filter(BrokerCash.user_id == user_id, BrokerCash.financial_year == financial_year)
        .order_by(BrokerCash.cash_date)
        .all()
    )

    fy_start, _ = _fy_start_end(financial_year)
    yearly_pnl = calculate_period_pnl(all_trades, fy_start, today, per_trade_fee)

    yt = float(target.yearly_target)

    def pct(actual: float, tgt: float) -> float:
        return round((actual / tgt) * 100, 2) if tgt > 0 else 0.0

    # ── Quarters ──
    quarters = []
    for label, q_start, q_end in _all_quarters_in_fy(financial_year):
        cap = _capital_as_of(cash_entries, q_end)
        q_tgt = round((cap * 0.10) / 4, 2) if cap > 0 else 0.0
        effective_end = min(q_end, today)
        pnl = calculate_period_pnl(all_trades, q_start, effective_end, per_trade_fee) if q_start <= today else 0.0
        quarters.append({
            "label": label,
            "start": q_start.isoformat(),
            "end": q_end.isoformat(),
            "capital_base": round(cap, 2),
            "target": q_tgt,
            "pnl": pnl,
            "achieved": pnl >= q_tgt if q_tgt > 0 else False,
            "pct": pct(pnl, q_tgt),
            "is_future": q_start > today,
        })

    # ── Months ──
    months = []
    for label, m_start, m_end in _all_months_in_fy(financial_year):
        cap = _capital_as_of(cash_entries, m_end)
        m_tgt = round((cap * 0.10) / 12, 2) if cap > 0 else 0.0
        effective_end = min(m_end, today)
        pnl = calculate_period_pnl(all_trades, m_start, effective_end, per_trade_fee) if m_start <= today else 0.0
        months.append({
            "label": label,
            "start": m_start.isoformat(),
            "end": m_end.isoformat(),
            "capital_base": round(cap, 2),
            "target": m_tgt,
            "pnl": pnl,
            "achieved": pnl >= m_tgt if m_tgt > 0 else False,
            "pct": pct(pnl, m_tgt),
            "is_future": m_start > today,
        })

    # ── Weeks ──
    weeks = []
    for label, w_start, w_end in _all_weeks_in_fy(financial_year):
        cap = _capital_as_of(cash_entries, w_end)
        w_tgt = round((cap * 0.10) / 52, 2) if cap > 0 else 0.0
        effective_end = min(w_end, today)
        pnl = calculate_period_pnl(all_trades, w_start, effective_end, per_trade_fee) if w_start <= today else 0.0
        weeks.append({
            "label": label,
            "start": w_start.isoformat(),
            "end": w_end.isoformat(),
            "capital_base": round(cap, 2),
            "target": w_tgt,
            "pnl": pnl,
            "achieved": pnl >= w_tgt if w_tgt > 0 else False,
            "pct": pct(pnl, w_tgt),
            "is_future": w_start > today,
        })

    cur_quarter = next((q for q in quarters if not q["is_future"] and q["end"] >= today.isoformat()), quarters[-1])
    cur_month = next((m for m in months if not m["is_future"] and m["end"] >= today.isoformat()), months[-1])
    cur_week = next((w for w in weeks if not w["is_future"] and w["end"] >= today.isoformat()), weeks[-1])

    return {
        "financial_year": financial_year,
        "yearly_target": yt,
        "quarterly_target": cur_quarter["target"] if cur_quarter else 0.0,
        "monthly_target": cur_month["target"] if cur_month else 0.0,
        "weekly_target": cur_week["target"] if cur_week else 0.0,
        "yearly_pnl": yearly_pnl,
        "current_quarter_pnl": cur_quarter["pnl"],
        "current_month_pnl": cur_month["pnl"],
        "current_week_pnl": cur_week["pnl"],
        "yearly_achieved": yearly_pnl >= yt if yt > 0 else False,
        "quarterly_achieved": cur_quarter["achieved"],
        "monthly_achieved": cur_month["achieved"],
        "weekly_achieved": cur_week["achieved"],
        "yearly_pct": pct(yearly_pnl, yt),
        "quarterly_pct": cur_quarter["pct"],
        "monthly_pct": cur_month["pct"],
        "weekly_pct": cur_week["pct"],
        "all_quarters": quarters,
        "all_months": months,
        "all_weeks": weeks,
    }
