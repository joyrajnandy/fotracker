from sqlalchemy.orm import Session
from datetime import date, timedelta
from typing import List
import calendar
from app.models.target import Target
from app.models.broker_cash import BrokerCash
from app.models.trade import Trade
from app.services.pnl_service import (
    calculate_period_pnl,
    calculate_zerodha_charges,
    get_or_create_brokerage_setting,
    _split_contract_realized_and_open,
)


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
    # Weeks end every Thursday (Friday=4 .. Thursday=3), clipped to [fy_start, fy_end]
    cur = start - timedelta(days=(start.weekday() - 4) % 7)
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


def _pro_rata_target(
    cash_entries: list,
    period_start: date,
    period_end: date,
    fy_start: date,
    total_fy_days: int,
) -> tuple[float, float]:
    """
    Calculate pro-rata 10% p.a. target and time-weighted capital base for [period_start, period_end]
    based on each cash deposit date and remaining active days in the period/FY.
    Returns (target_amount, effective_capital_base_at_period_end).
    """
    period_days = (period_end - period_start).days + 1
    if period_days <= 0 or total_fy_days <= 0:
        return 0.0, 0.0

    target_sum = 0.0
    capital_at_end = 0.0

    for c in cash_entries:
        if c.cash_date > period_end:
            continue
        amt = float(c.amount)
        capital_at_end += amt
        active_start = max(period_start, fy_start, c.cash_date)
        active_days = (period_end - active_start).days + 1
        if active_days > 0:
            target_sum += amt * 0.10 * (active_days / total_fy_days)

    return round(target_sum, 2), round(capital_at_end, 2)


def _analyze_missed_week(
    all_trades: list,
    w_start: date,
    effective_end: date,
    w_tgt: float,
    net_pnl: float,
    custom_total: float | None,
    total_trades_count: int,
    today: date,
) -> dict:
    """Diagnose why a particular week's target was not met."""
    period_trades = [t for t in all_trades if w_start <= t.trade_date <= effective_end]
    shortfall = round(max(0.0, w_tgt - net_pnl), 2)

    if not period_trades:
        return {
            "shortfall": shortfall,
            "trades_count": 0,
            "gross_pnl": 0.0,
            "brokerage": 0.0,
            "reasons": [
                f"No trades executed during this week; ₹{shortfall:,.2f} target remained unmet."
            ],
        }

    realized_by_expiry, open_positions = _split_contract_realized_and_open(period_trades, today)
    gross_pnl = round(sum(grp["gross_pnl"] for grp in realized_by_expiry.values()), 2)
    if custom_total is not None and total_trades_count > 0:
        brokerage = round(custom_total * (len(period_trades) / total_trades_count), 2)
    else:
        brokerage = calculate_zerodha_charges(period_trades, 20.0)

    # Per-contract gross P&L to identify biggest losers & win rate
    contract_pnls: dict[str, float] = {}
    for t in period_trades:
        val = float(t.quantity) * float(t.price)
        contract_pnls[t.symbol] = contract_pnls.get(t.symbol, 0.0) + (val if t.trade_type == "sell" else -val)

    # Only evaluate closed/matched contracts from realized_by_expiry or net contract flow
    losers = sorted(((sym, p) for sym, p in contract_pnls.items() if p < -1.0), key=lambda x: x[1])
    winners = [p for p in contract_pnls.values() if p > 1.0]
    total_contracts = len(contract_pnls)

    reasons: list[str] = []

    if gross_pnl >= w_tgt and net_pnl < w_tgt:
        reasons.append(
            f"Gross P&L (+₹{gross_pnl:,.2f}) met the target, but brokerage & charges (₹{brokerage:,.2f} across {len(period_trades)} trades) pulled net P&L below target."
        )
    elif losers:
        worst_sym, worst_val = losers[0]
        reasons.append(
            f"Biggest loss in {worst_sym} (-₹{abs(worst_val):,.2f}), dragging weekly P&L down."
        )
        if len(losers) > 1:
            second_sym, second_val = losers[1]
            reasons.append(
                f"Additional loss in {second_sym} (-₹{abs(second_val):,.2f})."
            )

    if total_contracts > 0:
        win_rate = round((len(winners) / total_contracts) * 100)
        if len(winners) < total_contracts:
            reasons.append(
                f"Only {len(winners)}/{total_contracts} contracts were profitable ({win_rate}% win rate)."
            )

    if brokerage > 0 and not (gross_pnl >= w_tgt and net_pnl < w_tgt):
        if net_pnl < 0 and gross_pnl >= 0:
            reasons.append(
                f"Brokerage & statutory charges (₹{brokerage:,.2f} across {len(period_trades)} trades) turned positive gross P&L (+₹{gross_pnl:,.2f}) into a net loss."
            )
        elif len(period_trades) >= 15 or (w_tgt > 0 and brokerage >= w_tgt * 0.25):
            reasons.append(
                f"High charges drag: ₹{brokerage:,.2f} paid across {len(period_trades)} trades."
            )

    if open_positions:
        reasons.append(
            f"{len(open_positions)} position(s) remained open/unexpired in this period, deferring realized P&L."
        )

    if not reasons:
        reasons.append(
            f"Net P&L (+₹{net_pnl:,.2f}) fell ₹{shortfall:,.2f} short of the ₹{w_tgt:,.2f} target."
        )

    return {
        "shortfall": shortfall,
        "trades_count": len(period_trades),
        "gross_pnl": gross_pnl,
        "brokerage": brokerage,
        "reasons": reasons,
    }


def _recalculate(db: Session, user_id: int, financial_year: str) -> Target:
    """
    Calculate FY targets pro-rata based on each cash deposit date
    and its remaining days in the financial year (0 when no cash added).
    """
    fy_start, fy_end = _fy_start_end(financial_year)
    total_fy_days = (fy_end - fy_start).days + 1
    today = date.today()

    cash_entries = (
        db.query(BrokerCash)
        .filter(BrokerCash.user_id == user_id, BrokerCash.financial_year == financial_year)
        .order_by(BrokerCash.cash_date)
        .all()
    )

    yearly, _ = _pro_rata_target(cash_entries, fy_start, fy_end, fy_start, total_fy_days)

    # Current quarter/month/week pro-rata targets
    cur_q_range = next(((s, e) for _, s, e in _all_quarters_in_fy(financial_year) if s <= today <= e), (fy_start, fy_end))
    cur_m_range = next(((s, e) for _, s, e in _all_months_in_fy(financial_year) if s <= today <= e), (fy_start, fy_end))
    cur_w_range = next(((s, e) for _, s, e in _all_weeks_in_fy(financial_year) if s <= today <= e), (fy_start, fy_end))

    qt, _ = _pro_rata_target(cash_entries, cur_q_range[0], cur_q_range[1], fy_start, total_fy_days)
    mt, _ = _pro_rata_target(cash_entries, cur_m_range[0], cur_m_range[1], fy_start, total_fy_days)
    wt, _ = _pro_rata_target(cash_entries, cur_w_range[0], cur_w_range[1], fy_start, total_fy_days)

    target = (
        db.query(Target)
        .filter(Target.user_id == user_id, Target.financial_year == financial_year)
        .first()
    )
    if target:
        target.yearly_target = yearly
        target.quarterly_target = qt
        target.monthly_target = mt
        target.weekly_target = wt
    else:
        target = Target(
            user_id=user_id,
            financial_year=financial_year,
            yearly_target=yearly,
            quarterly_target=qt,
            monthly_target=mt,
            weekly_target=wt,
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


def get_target_achievement(db: Session, user_id: int, financial_year: str) -> dict:
    target = _recalculate(db, user_id, financial_year)
    today = date.today()
    fy_start, fy_end = _fy_start_end(financial_year)
    total_fy_days = (fy_end - fy_start).days + 1

    all_trades = db.query(Trade).filter(
        Trade.user_id == user_id,
        Trade.financial_year == financial_year,
    ).all()

    b_setting = get_or_create_brokerage_setting(db, user_id, financial_year)
    custom_total = float(b_setting.custom_total_brokerage) if b_setting.custom_total_brokerage is not None else None
    total_trades_count = len(all_trades)

    cash_entries = (
        db.query(BrokerCash)
        .filter(BrokerCash.user_id == user_id, BrokerCash.financial_year == financial_year)
        .order_by(BrokerCash.cash_date)
        .all()
    )

    yearly_pnl = calculate_period_pnl(all_trades, fy_start, min(today, fy_end), 20.0, custom_total, total_trades_count)
    yt = float(target.yearly_target)

    def pct(actual: float, tgt: float) -> float:
        return round((actual / tgt) * 100, 2) if tgt > 0 else 0.0

    # ── Quarters (pro-rata by deposit date & remaining days) ──
    quarters = []
    for label, q_start, q_end in _all_quarters_in_fy(financial_year):
        q_tgt, cap = _pro_rata_target(cash_entries, q_start, q_end, fy_start, total_fy_days)
        effective_end = min(q_end, today)
        pnl = calculate_period_pnl(all_trades, q_start, effective_end, 20.0, custom_total, total_trades_count) if q_start <= today else 0.0
        quarters.append({
            "label": label,
            "start": q_start.isoformat(),
            "end": q_end.isoformat(),
            "capital_base": cap,
            "target": q_tgt,
            "pnl": pnl,
            "achieved": pnl >= q_tgt if q_tgt > 0 else False,
            "pct": pct(pnl, q_tgt),
            "is_future": q_start > today,
        })

    # ── Months (pro-rata by deposit date & remaining days) ──
    months = []
    for label, m_start, m_end in _all_months_in_fy(financial_year):
        m_tgt, cap = _pro_rata_target(cash_entries, m_start, m_end, fy_start, total_fy_days)
        effective_end = min(m_end, today)
        pnl = calculate_period_pnl(all_trades, m_start, effective_end, 20.0, custom_total, total_trades_count) if m_start <= today else 0.0
        months.append({
            "label": label,
            "start": m_start.isoformat(),
            "end": m_end.isoformat(),
            "capital_base": cap,
            "target": m_tgt,
            "pnl": pnl,
            "achieved": pnl >= m_tgt if m_tgt > 0 else False,
            "pct": pct(pnl, m_tgt),
            "is_future": m_start > today,
        })

    # ── Weeks (pro-rata by deposit date & remaining days) ──
    weeks = []
    for label, w_start, w_end in _all_weeks_in_fy(financial_year):
        w_tgt, cap = _pro_rata_target(cash_entries, w_start, w_end, fy_start, total_fy_days)
        effective_end = min(w_end, today)
        is_future = w_start > today
        pnl = calculate_period_pnl(all_trades, w_start, effective_end, 20.0, custom_total, total_trades_count) if not is_future else 0.0
        if is_future:
            w_achieved = False
            w_pct = 0.0
        elif w_tgt == 0:
            w_achieved = True
            w_pct = 100.0
        else:
            w_achieved = pnl >= w_tgt
            w_pct = pct(pnl, w_tgt)

        miss_analysis = None
        if not is_future and not w_achieved:
            miss_analysis = _analyze_missed_week(
                all_trades, w_start, effective_end, w_tgt, pnl, custom_total, total_trades_count, today
            )

        weeks.append({
            "label": label,
            "start": w_start.isoformat(),
            "end": w_end.isoformat(),
            "capital_base": cap,
            "target": w_tgt,
            "pnl": pnl,
            "achieved": w_achieved,
            "pct": w_pct,
            "is_future": is_future,
            "miss_analysis": miss_analysis,
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
